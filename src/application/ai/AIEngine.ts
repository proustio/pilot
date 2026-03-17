import { Board, CellState, AttackResult } from '../../domain/board/Board';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { MatchMode, Match } from '../../domain/match/Match';
import { getIndex } from '../../domain/board/BoardUtils';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export class AIEngine {
    public difficulty: AIDifficulty = 'easy';
    
    private huntStack: {x: number, z: number}[] = [];
    private huntSet: Set<number> = new Set<number>();
    
    constructor() {}

    public setDifficulty(level: AIDifficulty) {
        this.difficulty = level;
    }

    /**
     * Resets the AI's memory (useful when a new game starts)
     */
    public reset() {
        this.huntStack = [];
        this.huntSet.clear();
    }

    /**
     * Computes the next coordinate to attack
     */
    public computeNextMove(playerBoard: Board, match: Match): {x: number, z: number} {
        switch (this.difficulty) {
            case 'easy':
                return this.computeEasyMove(playerBoard);
            case 'normal':
                return this.computeNormalMove(playerBoard);
            case 'hard':
                return this.computeHardMove(playerBoard, match);
            default:
                return this.computeEasyMove(playerBoard);
        }
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
                    { x: x - 1, z: z }
                ];

                for (const pos of adjacent) {
                    if (!playerBoard.isOutOfBounds(pos.x, pos.z)) {
                        const idx = getIndex(pos.x, pos.z, playerBoard.width);
                        const state = playerBoard.gridState[idx];
                        if (state === CellState.Empty || state === CellState.Ship) {
                            if (!this.huntSet.has(idx)) {
                                this.huntStack.push(pos);
                                this.huntSet.add(idx);
                            }
                        }
                    }
                }
            } else if (result === AttackResult.Sunk) {
                this.huntStack = [];
                this.huntSet.clear();
            }
        }
    }


    private computeEasyMove(board: Board): {x: number, z: number} {
        let x = 0;
        let z = 0;
        let valid = false;
        
        while (!valid) {
            x = Math.floor(Math.random() * board.width);
            z = Math.floor(Math.random() * board.height);
            
            const idx = getIndex(x, z, board.width);
            const state = board.gridState[idx];
            
            if (state === CellState.Empty || state === CellState.Ship) {
                valid = true;
            }
        }
        
        return { x, z };
    }

    private computeNormalMove(board: Board): {x: number, z: number} {
        while (this.huntStack.length > 0) {
            const target = this.huntStack.pop()!;
            
            const idx = getIndex(target.x, target.z, board.width);
            this.huntSet.delete(idx);

            const state = board.gridState[idx];
            
            if (state === CellState.Empty || state === CellState.Ship) {
                return target;
            }
        }
        
        return this.computeEasyMove(board);
    }

    private computeHardMove(board: Board, match: Match): {x: number, z: number} {
        if (this.huntStack.length > 0) {
            return this.computeNormalMove(board);
        }

        const aliveShips = board.ships.filter((s: Ship) => !s.isSunk());
        if (aliveShips.length === 0) {
           return this.computeEasyMove(board);
        }

        const width = board.width;
        const height = board.height;
        const heatMap = new Uint32Array(width * height);
        
        const ITERATIONS = 1000;

        for (let i = 0; i < ITERATIONS; i++) {
            const shipToPlace = aliveShips[Math.floor(Math.random() * aliveShips.length)];
            
            const x = Math.floor(Math.random() * width);
            const z = Math.floor(Math.random() * height);
            const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;
            
            if (this.canFitShipExperimentally(board, shipToPlace, x, z, orient, match.mode)) {
                for (let s = 0; s < shipToPlace.size; s++) {
                    const cx = orient === Orientation.Horizontal ? x + s : x;
                    const cz = orient === Orientation.Vertical ? z + s : z;
                    const idx = getIndex(cx, cz, width);
                    heatMap[idx]++;
                }
            }
        }

        let maxHeat = -1;
        let bestTarget = { x: -1, z: -1 };

        for (let z = 0; z < height; z++) {
            for (let x = 0; x < width; x++) {
                const idx = getIndex(x, z, width);
                const state = board.gridState[idx];
                
                if (state === CellState.Empty || state === CellState.Ship) {
                    if (heatMap[idx] > maxHeat) {
                        maxHeat = heatMap[idx];
                        bestTarget = { x, z };
                    }
                }
            }
        }

        if (bestTarget.x === -1) {
            return this.computeEasyMove(board);
        }

        return bestTarget;
    }

    /**
     * Checks if a ship can theoretically be placed at (x,z) without contradicting
     * the AI's known knowledge of the board (Misses, Sunk ships).
     */
    private canFitShipExperimentally(board: Board, ship: Ship, headX: number, headZ: number, orientation: Orientation, mode: MatchMode): boolean {
        if (!board.canPlaceShip(ship.size, headX, headZ, orientation)) {
            return false;
        }

        for (let i = 0; i < ship.size; i++) {
            const cx = orientation === Orientation.Horizontal ? headX + i : headX;
            const cz = orientation === Orientation.Vertical ? headZ + i : headZ;
            const idx = getIndex(cx, cz, board.width);
            const state = board.gridState[idx];

            if (state === CellState.Miss || state === CellState.Sunk) {
                return false;
            }

            if (mode === MatchMode.Russian) {
                 for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const nx = cx + dx;
                        const nz = cz + dz;
                        if (board.isOutOfBounds(nx, nz)) continue;
                        const nIdx = getIndex(nx, nz, board.width);
                        if (board.gridState[nIdx] === CellState.Sunk) {
                            return false;
                        }
                    }
                 }
            }
        }

        return true;
    }
}
