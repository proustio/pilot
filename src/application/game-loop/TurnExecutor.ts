import { Ship, Orientation } from '../../domain/fleet/Ship';
import { AIEngine } from '../ai/AIEngine';
import { GameState } from './GameLoop';
import { MatchMode } from '../../domain/match/Match';
import { eventBus, GameEventType } from '../events/GameEventBus';

type AttackResultListener = (x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean) => void;
type ShipPlacedListener = (ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) => void;

/**
 * Shared mutable state slice the TurnExecutor reads and writes.
 * GameLoop passes `this` (cast to this interface) in the constructor.
 */
export interface TurnExecutorState {
    match: import('../../domain/match/Match').Match | null;
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
 * Encapsulates all turn-execution logic: enemy AI turn, auto-battler player
 * turn, and the shared onGridClick handler for SETUP_BOARD and PLAYER_TURN.
 */
export class TurnExecutor {
    private s: TurnExecutorState;

    constructor(state: TurnExecutorState) {
        this.s = state;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Enemy Turn
    // ─────────────────────────────────────────────────────────────────────────

    public handleEnemyTurn(): void {
        if (!this.s.match) return;

        const executeTurn = () => {
            if (!this.s.match) return;

            if (this.s.isPaused) {
                setTimeout(executeTurn, 100);
                return;
            }

            this.s.isAnimating = true;

            const flipWait = this.s.config.timing.boardFlipWaitMs / this.s.config.timing.gameSpeedMultiplier;
            setTimeout(() => {
                setTimeout(() => {
                    if (!this.s.match) return;

                    if (this.s.isPaused) {
                        this.s.isAnimating = false;
                        executeTurn();
                        return;
                    }

                    const targetBoard = this.s.match.mode === MatchMode.Rogue ? this.s.match.sharedBoard : this.s.match.playerBoard;
                    
                    if (this.s.match.mode === MatchMode.Rogue) {
                        // Rogue AI Logic: Multiple ships, Move OR Attack
                        const activeIndex = this.s.activeEnemyRogueShipIndex;
                        const ship = this.s.enemyRogueShipOrder[activeIndex];

                        if (!ship) {
                            this.s.advanceEnemyRogueShipTurn();
                            return;
                        }

                        const action = this.s.aiEngine.decideAction(ship, targetBoard, this.s.match);
                        
                        const completeAction = () => {
                            this.s.isAnimating = false;
                            
                            // Check game end before advancing
                            const status = this.s.match!.checkGameEnd();
                            if (status !== 'ongoing') {
                                this.s.transitionTo(GameState.GAME_OVER);
                            } else {
                                this.s.advanceEnemyRogueShipTurn();
                            }
                        };

                        if (action === 'move') {
                            const move = this.s.aiEngine.computeMove(ship, targetBoard, this.s.match);
                            if (move) {
                                const moved = targetBoard.moveShip(ship, move.x, move.z, move.orientation);
                                if (moved.success) {
                                    const cost = ship.calculateMoveCost(move.x, move.z);
                                    ship.movesRemaining = Math.max(0, ship.movesRemaining - cost);
                                    ship.hasActedThisTurn = true;
                                    this.s.onShipMovedInvoke(ship, move.x, move.z, move.orientation);
                                    
                                    this.s.onAnimationsComplete = completeAction;
                                    // Safety fallback: if no animation triggered, complete manually
                                    setTimeout(() => {
                                        if (this.s.onAnimationsComplete === completeAction) {
                                            this.s.onAnimationsComplete = null;
                                            completeAction();
                                        }
                                    }, 500); 
                                    return;
                                }
                            }
                        } else if (action === 'attack') {
                            const target = this.s.aiEngine.computeNextMove(targetBoard, this.s.match);
                            const dist = Math.max(Math.abs(target.x - ship.headX), Math.abs(target.z - ship.headZ));
                            if (dist <= 10) {
                                const result = targetBoard.receiveAttack(target.x, target.z);
                                ship.hasActedThisTurn = true;
                                ship.movesRemaining = 0;
                                this.s.aiEngine.reportResult(target.x, target.z, result.toString(), targetBoard);
                                this.s.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), false, false));
                                
                                this.s.onAnimationsComplete = completeAction;
                                // Safety fallback: if no animation triggered (e.g. miss that doesn't trigger falling marker)
                                setTimeout(() => {
                                    if (this.s.onAnimationsComplete === completeAction) {
                                        this.s.onAnimationsComplete = null;
                                        completeAction();
                                    }
                                }, 1500); 
                                return;
                            }
                        }
                        
                        // Default fallback
                        ship.hasActedThisTurn = true;
                        completeAction();
                    } else {
                        // Classic AI Logic
                        const target = this.s.aiEngine.computeNextMove(targetBoard, this.s.match);
                        const result = targetBoard.receiveAttack(target.x, target.z);

                        this.s.aiEngine.reportResult(target.x, target.z, result.toString(), targetBoard);
                        this.s.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), false, false));

                        this.s.onAnimationsComplete = () => {
                            if (this.s.isPaused) {
                                setTimeout(this.s.onAnimationsComplete!, 100);
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
                                this.s.transitionTo(GameState.PLAYER_TURN);
                            }
                        };
                    }

                }, this.s.config.timing.aiThinkingTimeMs / this.s.config.timing.gameSpeedMultiplier);
            }, flipWait);
        };

        executeTurn();
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
                setTimeout(() => {
                    if (!this.s.match) return;

                    if (this.s.isPaused) {
                        this.s.isAnimating = false;
                        executeTurn();
                        return;
                    }

                    const targetBoard = this.s.match.mode === MatchMode.Rogue ? this.s.match.sharedBoard : this.s.match.enemyBoard;
                    const target = this.s.playerAIEngine.computeNextMove(targetBoard, this.s.match);
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
    // Grid Click (SETUP_BOARD + PLAYER_TURN)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Handles a click during SETUP_BOARD phase.
     */
    public onSetupBoardClick(x: number, z: number, _isPlayerSide?: boolean): void {
        if (!this.s.match || this.s.isPaused) return;
        if (this.s.playerShipsToPlace.length === 0) return;

        const isRogue = this.s.match.mode === MatchMode.Rogue;
        const nextShip = this.s.playerShipsToPlace[0];
        const targetBoard = isRogue ? this.s.match.sharedBoard : this.s.match.playerBoard;
        
        const isValid = this.s.match.validatePlacement(
            targetBoard, nextShip, x, z, this.s.currentPlacementOrientation
        );

        if (isValid) {
            const placed = targetBoard.placeShip(nextShip, x, z, this.s.currentPlacementOrientation);
            if (placed) {
                this.s.playerShipsToPlace.shift();
                this.s.shipPlacedListeners.forEach(l =>
                    l(nextShip, x, z, this.s.currentPlacementOrientation, true)
                );
                this.s.requestAutoSave();

                if (this.s.playerShipsToPlace.length === 0) {
                    if (this.s.match.mode === MatchMode.Rogue) {
                        const enemyShips = this.s.match.getRequiredFleet();
                        const sharedBoard = this.s.match.sharedBoard; 
                        for (const ship of enemyShips) {
                            ship.isEnemy = true;
                            let placed = false;
                            let attempts = 0;
                            while (!placed && attempts < 1000) {
                                const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;
                                // Enemy must be in bottom-right quadrant: X [13,19], Z [13,19]
                                const maxX = 20 - (orient === Orientation.Horizontal ? ship.size : 1);
                                const maxZ = 20 - (orient === Orientation.Vertical ? ship.size : 1);
                                
                                const x = 13 + Math.floor(Math.random() * (maxX - 13 + 1));
                                const z = 13 + Math.floor(Math.random() * (maxZ - 13 + 1));

                                if (this.s.match.validatePlacement(sharedBoard, ship, x, z, orient)) {
                                    placed = sharedBoard.placeShip(ship, x, z, orient);
                                    if (placed) {
                                        this.s.shipPlacedListeners.forEach(l => l(ship, x, z, orient, false));
                                    }
                                }
                                attempts++;
                            }
                        }
                    }
                    this.s.transitionTo(GameState.PLAYER_TURN);
                }
            }
        }
    }

    /**
     * Handles a click during PLAYER_TURN phase (manual attack).
     */
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
                // Dispatch weapon event and let GameLoop handle it
                eventBus.emit(GameEventType.ROGUE_USE_WEAPON, {
                    weaponType: weapon,
                    targetX: x,
                    targetZ: z,
                    radius: 2, // default for sonar
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
                // Too far
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
