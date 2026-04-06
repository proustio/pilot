import { Ship, Orientation } from '../../domain/fleet/Ship';
import { AIEngine } from '../ai/AIEngine';
import { GameState } from './GameLoop';
import { Match, MatchMode } from '../../domain/match/Match';
import { eventBus, GameEventType } from '../events/GameEventBus';
import { EnemyTurnHandler } from './EnemyTurnHandler';
import { SetupBoardHandler } from './SetupBoardHandler';

type AttackResultListener = (x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean) => void;
type ShipPlacedListener = (ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) => void;

/**
 * Shared mutable state slice the TurnExecutor reads and writes.
 * GameLoop passes `this` (cast to this interface) in the constructor.
 */
export interface TurnExecutorState {
    match: Match | null;
    isAnimating: boolean;
    isPaused: boolean;
    playerShipsToPlace: Ship[];
    currentPlacementOrientation: Orientation;
    aiEngine: AIEngine;
    playerAIEngine: AIEngine;
    airStrikeOrientation: Orientation;
    shipPlacedListeners: ShipPlacedListener[];
    attackResultListeners: AttackResultListener[];
    onAnimationsComplete: (() => void) | null;
    activeRogueShipIndex: number;
    activeEnemyRogueShipIndex: number;
    rogueShipOrder: Ship[];
    enemyRogueShipOrder: Ship[];
    transitionTo: (state: GameState) => void;
    advanceRogueShipTurn: () => void;
    advanceEnemyRogueShipTurn: () => void;
    requestAutoSave: () => void;
    onShipMovedInvoke: (ship: Ship, x: number, z: number, orientation: Orientation) => void;
    config: {
        timing: { boardFlipWaitMs: number; gameSpeedMultiplier: number; aiThinkingTimeMs: number };
        autoBattler: boolean;
    };
}

/**
 * Orchestrates turn execution: delegates enemy turns to EnemyTurnHandler,
 * setup-board clicks to SetupBoardHandler, and retains player turn click
 * and auto-battler logic directly.
 */
export class TurnExecutor {
    private s: TurnExecutorState;
    private enemyTurnHandler: EnemyTurnHandler;
    private setupBoardHandler: SetupBoardHandler;

    constructor(state: TurnExecutorState) {
        this.s = state;
        this.enemyTurnHandler = new EnemyTurnHandler(state);
        this.setupBoardHandler = new SetupBoardHandler(state);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State Entry
    // ─────────────────────────────────────────────────────────────────────────

    public onEnterState(newState: GameState): void {
        if (newState === GameState.PLAYER_TURN) {
            console.log(`[${new Date().toISOString()}] TurnExecutor: player turn starts`);
            if (this.s.match && this.s.match.mode === MatchMode.Rogue) {
                this.s.rogueShipOrder = this.s.match.sharedBoard.ships
                    .filter(s => !s.isEnemy && !s.isSunk())
                    .sort((a, b) => a.size - b.size);
                
                this.s.rogueShipOrder.forEach(s => s.resetTurnAction());
                this.s.activeRogueShipIndex = 0;

                if (this.s.rogueShipOrder.length > 0) {
                    eventBus.emit(GameEventType.ACTIVE_SHIP_CHANGED, { ship: this.s.rogueShipOrder[0], index: 0 });
                } else if (!this.s.config.autoBattler) {
                    this.s.transitionTo(GameState.ENEMY_TURN);
                    console.log(`[${new Date().toISOString()}] TurnExecutor: Exiting onEnterState (auto-transition to enemy turn)`);
                    return;
                }
            }
        } else if (newState === GameState.ENEMY_TURN) {
            console.log(`[${new Date().toISOString()}] TurnExecutor: enemy turn starts`);
            if (this.s.match && this.s.match.mode === MatchMode.Rogue) {
                this.s.enemyRogueShipOrder = this.s.match.sharedBoard.ships
                    .filter(s => s.isEnemy && !s.isSunk())
                    .sort((a, b) => a.size - b.size);
                
                this.s.enemyRogueShipOrder.forEach(s => s.resetTurnAction());
                this.s.activeEnemyRogueShipIndex = 0;
            }
        }

        if (newState === GameState.ENEMY_TURN) {
            console.log(`[${new Date().toISOString()}] TurnExecutor: turn transitions to enemy`);
            this.handleEnemyTurn();
        } else if (newState === GameState.PLAYER_TURN && this.s.config.autoBattler) {
            console.log(`[${new Date().toISOString()}] TurnExecutor: turn transitions to autobattler player move`);
            this.handleAutoPlayerTurn();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Enemy Turn — delegated to EnemyTurnHandler
    // ─────────────────────────────────────────────────────────────────────────

    public handleEnemyTurn(): void {
        this.enemyTurnHandler.execute();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Auto-battler Player Turn
    // ─────────────────────────────────────────────────────────────────────────

    public handleAutoPlayerTurn(): void {
        if (!this.s.match || this.s.isAnimating) return;

        const executeTurn = () => {
            if (!this.s.match) return;

            if (this.s.isPaused) {
                setTimeout(executeTurn, 100);
                return;
            }

            this.s.isAnimating = true;

            const flipWait = this.s.config.timing.boardFlipWaitMs / this.s.config.timing.gameSpeedMultiplier;
            setTimeout(() => {
                setTimeout(async () => {
                    if (!this.s.match) return;

                    if (this.s.isPaused) {
                        this.s.isAnimating = false;
                        executeTurn();
                        return;
                    }

                    const targetBoard = this.s.match.mode === MatchMode.Rogue ? this.s.match.sharedBoard : this.s.match.enemyBoard;
                    const target = await this.s.playerAIEngine.computeNextMove(targetBoard, this.s.match);
                    const result = targetBoard.receiveAttack(target.x, target.z);

                    this.s.playerAIEngine.reportResult(target.x, target.z, result.toString(), targetBoard);
                    this.s.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), true, false));

                    const finalizeTurn = () => {
                        if (this.s.isPaused) {
                            setTimeout(finalizeTurn, 100);
                            return;
                        }

                        let status: 'ongoing' | 'player_wins' | 'enemy_wins' = 'ongoing';
                        try {
                            status = this.s.match!.checkGameEnd();
                        } catch (e: any) {
                            if (e.message === 'Board has no ships') {
                                eventBus.emit(GameEventType.EXIT_GAME, undefined as any);
                                return;
                            }
                            throw e;
                        }
                        this.s.isAnimating = false;
                        if (status !== 'ongoing') {
                            this.s.transitionTo(GameState.GAME_OVER);
                        } else {
                            this.s.transitionTo(GameState.ENEMY_TURN);
                        }
                    };

                    this.s.onAnimationsComplete = finalizeTurn;

                }, this.s.config.timing.aiThinkingTimeMs / this.s.config.timing.gameSpeedMultiplier);
            }, flipWait);
        };

        executeTurn();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Setup Board Click — delegated to SetupBoardHandler
    // ─────────────────────────────────────────────────────────────────────────

    public onSetupBoardClick(x: number, z: number, isPlayerSide?: boolean): void {
        this.setupBoardHandler.handleClick(x, z, isPlayerSide);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Player Turn Click
    // ─────────────────────────────────────────────────────────────────────────

    public onPlayerTurnClick(x: number, z: number, isPlayerSide?: boolean): void {
        if (!this.s.match || this.s.isPaused) return;
        if (this.s.isAnimating || this.s.config.autoBattler) return;

        const isRogue = this.s.match.mode === MatchMode.Rogue;
        if (!isRogue && isPlayerSide === true) return;

        if (isRogue) {
            const actionMode = (window as any).selectedRogueAction || 'attack';
            const weapon = (window as any).selectedRogueWeapon || 'cannon';

            if (actionMode === 'move' && weapon === 'sail') {
                eventBus.emit(GameEventType.ROGUE_ATTEMPT_MOVE, {
                    targetX: x, targetZ: z
                });
                return;
            }

            if (weapon !== 'cannon' && weapon !== 'sail') {
                eventBus.emit(GameEventType.ROGUE_USE_WEAPON, {
                    weaponType: weapon,
                    targetX: x,
                    targetZ: z,
                    radius: 2,
                    directionX: this.s.airStrikeOrientation === Orientation.Horizontal ? 1 : 0,
                    directionZ: this.s.airStrikeOrientation === Orientation.Vertical ? 1 : 0
                });
                return;
            }
        }

        const targetBoard = isRogue ? this.s.match.sharedBoard : this.s.match.enemyBoard;

        if (isRogue) {
            const ship = this.s.rogueShipOrder?.[this.s.activeRogueShipIndex] || null;
            if (ship && !this.s.match.validateAttackRange(ship, x, z)) {
                return;
            }
        }

        const result = targetBoard.receiveAttack(x, z);

        if (result !== 'invalid') {
            this.s.attackResultListeners.forEach(l => l(x, z, result, true, false));
            this.s.isAnimating = true;

            const finalizeTurn = () => {
                if (this.s.isPaused) {
                    setTimeout(finalizeTurn, 100);
                    return;
                }

                let status: 'ongoing' | 'player_wins' | 'enemy_wins' = 'ongoing';
                try {
                    status = this.s.match!.checkGameEnd();
                } catch (e: any) {
                    if (e.message === 'Board has no ships') {
                        eventBus.emit(GameEventType.EXIT_GAME, undefined as any);
                        return;
                    }
                    throw e;
                }
                this.s.isAnimating = false;
                if (status !== 'ongoing') {
                    this.s.transitionTo(GameState.GAME_OVER);
                } else {
                    if (this.s.match!.mode === MatchMode.Rogue) {
                        this.s.advanceRogueShipTurn();
                    } else {
                        this.s.transitionTo(GameState.ENEMY_TURN);
                    }
                }
            };

            this.s.onAnimationsComplete = finalizeTurn;
        }
    }
}
