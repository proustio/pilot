import { MatchMode } from '../../domain/match/Match';
import { eventBus, GameEventType } from '../events/GameEventBus';
import { GameState } from './GameLoop';
import { TurnExecutorState } from './TurnExecutor';

/**
 * Handles enemy AI turn execution for both Classic and Rogue modes.
 * Extracted from TurnExecutor to isolate enemy-turn logic.
 */
export class EnemyTurnHandler {
    private s: TurnExecutorState;

    constructor(state: TurnExecutorState) {
        this.s = state;
    }

    public execute(): void {
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
                        this.executeRogueTurn(targetBoard);
                    } else {
                        this.executeClassicTurn(targetBoard);
                    }

                }, this.s.config.timing.aiThinkingTimeMs / this.s.config.timing.gameSpeedMultiplier);
            }, flipWait);
        };

        executeTurn();
    }

    private executeRogueTurn(targetBoard: import('../../domain/board/Board').Board): void {
        const activeIndex = this.s.activeEnemyRogueShipIndex;
        const ship = this.s.enemyRogueShipOrder[activeIndex];

        if (!ship) {
            this.s.advanceEnemyRogueShipTurn();
            return;
        }

        const action = this.s.aiEngine.decideAction(ship, targetBoard, this.s.match!);

        const completeAction = () => {
            this.s.isAnimating = false;

            const status = this.s.match!.checkGameEnd();
            if (status !== 'ongoing') {
                this.s.transitionTo(GameState.GAME_OVER);
            } else {
                this.s.advanceEnemyRogueShipTurn();
            }
        };

        if (action === 'move') {
            const move = this.s.aiEngine.computeMove(ship, targetBoard, this.s.match!);
            if (move) {
                const moved = targetBoard.moveShip(ship, move.x, move.z, move.orientation);
                if (moved.success) {
                    const cost = ship.calculateMoveCost(move.x, move.z);
                    ship.movesRemaining = Math.max(0, ship.movesRemaining - cost);
                    ship.hasActedThisTurn = true;
                    eventBus.emit(GameEventType.ENEMY_ACTION, {
                        shipId: ship.id,
                        actionType: 'move',
                        targetX: move.x,
                        targetZ: move.z
                    });
                    this.s.onShipMovedInvoke(ship, move.x, move.z, move.orientation);

                    this.s.onAnimationsComplete = completeAction;
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
            const target = this.s.aiEngine.computeNextMove(targetBoard, this.s.match!);
            const dist = Math.max(Math.abs(target.x - ship.headX), Math.abs(target.z - ship.headZ));
            if (dist <= 10) {
                const result = targetBoard.receiveAttack(target.x, target.z);
                ship.hasActedThisTurn = true;
                ship.movesRemaining = 0;
                eventBus.emit(GameEventType.ENEMY_ACTION, {
                    shipId: ship.id,
                    actionType: 'attack',
                    targetX: target.x,
                    targetZ: target.z
                });
                this.s.aiEngine.reportResult(target.x, target.z, result.toString(), targetBoard);
                this.s.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), false, false));

                this.s.onAnimationsComplete = completeAction;
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
    }

    private executeClassicTurn(targetBoard: import('../../domain/board/Board').Board): void {
        const target = this.s.aiEngine.computeNextMove(targetBoard, this.s.match!);
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
}
