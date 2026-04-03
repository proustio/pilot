import { Board, CellState, AttackResult } from '../../domain/board/Board';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { Match } from '../../domain/match/Match';
import { getIndex } from '../../domain/board/BoardUtils';
import { AIMovement } from './AIMovement';
import { AITargeting } from './AITargeting';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export class AIEngine {
    public difficulty: AIDifficulty = 'easy';

    private huntStack: { x: number; z: number }[] = [];
    private movement = new AIMovement();
    private targeting = new AITargeting();

    constructor() { }

    public setDifficulty(level: AIDifficulty) {
        this.difficulty = level;
    }

    /**
     * Resets the AI's memory (useful when a new game starts)
     */
    public reset() {
        this.huntStack = [];
    }

    /**
     * Decides whether the AI ship should move or attack.
     * Return 'move' | 'attack' | 'skip'
     */
    public decideAction(ship: Ship, board: Board, match: Match): 'move' | 'attack' | 'skip' {
        return this.movement.decideAction(ship, board, match, this.difficulty);
    }

    /**
     * Computes the next movement target for an AI ship.
     */
    public computeMove(ship: Ship, board: Board, match: Match): { x: number; z: number; orientation: Orientation } | null {
        return this.movement.computeMove(ship, board, match, this.difficulty);
    }

    /**
     * Computes the next coordinate to attack
     */
    public async computeNextMove(playerBoard: Board, match: Match): Promise<{ x: number; z: number }> {
        return this.targeting.computeNextMove(playerBoard, match, this.difficulty, this.huntStack);
    }

    /**
     * Called by the GameLoop after an attack is resolved to update AI state
     */
    public reportResult(x: number, z: number, result: string, playerBoard: Board) {
        if (this.difficulty === 'normal' || this.difficulty === 'hard') {
            if (result === AttackResult.Hit) {
                const adjacent = [
                    { x: x, z: z - 1 },
                    { x: x, z: z + 1 },
                    { x: x + 1, z: z },
                    { x: x - 1, z: z },
                ];

                for (const pos of adjacent) {
                    if (!playerBoard.isOutOfBounds(pos.x, pos.z)) {
                        const idx = getIndex(pos.x, pos.z, playerBoard.width);
                        const state = playerBoard.gridState[idx];
                        if (state === CellState.Empty || state === CellState.Ship) {
                            if (!this.huntStack.some(p => p.x === pos.x && p.z === pos.z)) {
                                this.huntStack.push(pos);
                            }
                        }
                    }
                }
            } else if (result === AttackResult.Sunk) {
                this.huntStack = [];
            }
        }
    }
}
