import { Ship, Orientation } from '../../domain/fleet/Ship';
import { AIEngine } from '../ai/AIEngine';
import { Config } from '../../infrastructure/config/Config';
import { GameState } from './GameLoop';

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
    shipPlacedListeners: ShipPlacedListener[];
    attackResultListeners: AttackResultListener[];
    onAnimationsComplete: (() => void) | null;
    transitionTo: (state: GameState) => void;
    triggerAutoSave: () => void;
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

            const flipWait = Config.timing.boardFlipWaitMs / Config.timing.gameSpeedMultiplier;
            setTimeout(() => {
                setTimeout(() => {
                    if (!this.s.match) return;

                    if (this.s.isPaused) {
                        this.s.isAnimating = false;
                        executeTurn();
                        return;
                    }

                    const target = this.s.aiEngine.computeNextMove(this.s.match.playerBoard, this.s.match);
                    const result = this.s.match.playerBoard.receiveAttack(target.x, target.z);

                    this.s.aiEngine.reportResult(target.x, target.z, result.toString(), this.s.match.playerBoard);
                    this.s.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), false, false));

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
                                document.dispatchEvent(new CustomEvent('EXIT_GAME'));
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

                    this.s.onAnimationsComplete = finalizeTurn;

                }, Config.timing.aiThinkingTimeMs / Config.timing.gameSpeedMultiplier);
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

            const flipWait = Config.timing.boardFlipWaitMs / Config.timing.gameSpeedMultiplier;
            setTimeout(() => {
                setTimeout(() => {
                    if (!this.s.match) return;

                    if (this.s.isPaused) {
                        this.s.isAnimating = false;
                        executeTurn();
                        return;
                    }

                    const target = this.s.playerAIEngine.computeNextMove(this.s.match.enemyBoard, this.s.match);
                    const result = this.s.match.enemyBoard.receiveAttack(target.x, target.z);

                    this.s.playerAIEngine.reportResult(target.x, target.z, result.toString(), this.s.match.enemyBoard);
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
                                document.dispatchEvent(new CustomEvent('EXIT_GAME'));
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

                }, Config.timing.aiThinkingTimeMs / Config.timing.gameSpeedMultiplier);
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
    public onSetupBoardClick(x: number, z: number, isPlayerSide?: boolean): void {
        if (!this.s.match || this.s.isPaused) return;
        if (isPlayerSide === false) return;
        if (this.s.playerShipsToPlace.length === 0) return;

        const nextShip = this.s.playerShipsToPlace[0];
        const isValid = this.s.match.validatePlacement(
            this.s.match.playerBoard, nextShip, x, z, this.s.currentPlacementOrientation
        );

        if (isValid) {
            const placed = this.s.match.playerBoard.placeShip(nextShip, x, z, this.s.currentPlacementOrientation);
            if (placed) {
                this.s.playerShipsToPlace.shift();
                this.s.shipPlacedListeners.forEach(l =>
                    l(nextShip, x, z, this.s.currentPlacementOrientation, true)
                );
                this.s.triggerAutoSave();

                if (this.s.playerShipsToPlace.length === 0) {
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
        if (this.s.isAnimating || Config.autoBattler) return;
        if (isPlayerSide === true) return;

        const result = this.s.match.enemyBoard.receiveAttack(x, z);

        if (result !== 'invalid') {
            this.s.attackResultListeners.forEach(l => l(x, z, result, true, false));
            this.s.isAnimating = true;

            const finalizeTurn = () => {
                let status: 'ongoing' | 'player_wins' | 'enemy_wins' = 'ongoing';
                try {
                    status = this.s.match!.checkGameEnd();
                } catch (e: any) {
                    if (e.message === 'Board has no ships') {
                        document.dispatchEvent(new CustomEvent('EXIT_GAME'));
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
        }
    }
}
