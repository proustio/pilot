import { Board, CellState, AttackResult } from '../../domain/board/Board';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { MatchMode, Match } from '../../domain/match/Match';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export class AIEngine {
    public difficulty: AIDifficulty = 'easy';
    
    // State for Normal mode (Hunt and Target)
    private huntStack: {x: number, z: number}[] = [];
    
    constructor() {}

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
                // Add adjacent cells to the hunt stack if they are valid targets
                const adjacent = [
                    { x: x, z: z - 1 }, // North
                    { x: x, z: z + 1 }, // South
                    { x: x + 1, z: z }, // East
                    { x: x - 1, z: z }  // West
                ];

                for (const pos of adjacent) {
                    if (!playerBoard.isOutOfBounds(pos.x, pos.z)) {
                        const idx = pos.z * playerBoard.width + pos.x;
                        const state = playerBoard.gridState[idx];
                        if (state === CellState.Empty || state === CellState.Ship) {
                            // Ensure it's not already in the stack
                            if (!this.huntStack.some(p => p.x === pos.x && p.z === pos.z)) {
                                this.huntStack.push(pos);
                            }
                        }
                    }
                }
            } else if (result === AttackResult.Sunk) {
                // Ship sunk, clear hunt stack
                this.huntStack = [];
            }
        }
    }

    // --- Difficulty Strategies ---

    private computeEasyMove(board: Board): {x: number, z: number} {
        let x = 0;
        let z = 0;
        let valid = false;
        
        // Randomly pick a coordinate until we find one that hasn't been shot at
        while (!valid) {
            x = Math.floor(Math.random() * board.width);
            z = Math.floor(Math.random() * board.height);
            
            const idx = z * board.width + x;
            const state = board.gridState[idx];
            
            if (state === CellState.Empty || state === CellState.Ship) {
                valid = true;
            }
        }
        
        return { x, z };
    }

    private computeNormalMove(board: Board): {x: number, z: number} {
        // If we have targets in the hunt stack, try them out
        while (this.huntStack.length > 0) {
            const target = this.huntStack.pop()!;
            
            const idx = target.z * board.width + target.x;
            const state = board.gridState[idx];
            
            // Re-verify the target is still valid (it could have been shot randomly or adjacent to another sunk ship)
            if (state === CellState.Empty || state === CellState.Ship) {
                return target;
            }
        }
        
        // If stack is empty or exhausted, fallback to random search
        return this.computeEasyMove(board);
    }

    private computeHardMove(board: Board, match: Match): {x: number, z: number} {
        // First, if we hit something, act like Normal AI to finish it off quickly.
        // It's usually optimal to sink a known damaged ship rather than searching elsewhere.
        if (this.huntStack.length > 0) {
            return this.computeNormalMove(board);
        }

        // --- Monte Carlo Probabilistic Heatmap ---
        
        // 1. Determine which ships are still alive
        // We look at the player's actual ships and filter out sunk ones.
        // (In a real game, the AI only knows what types of ships *exist* in the mode and crosses them off as they sink)
        const aliveShips = board.ships.filter((s: Ship) => !s.isSunk());
        if (aliveShips.length === 0) {
           return this.computeEasyMove(board); // Fallback
        }

        const width = board.width;
        const height = board.height;
        const heatMap = new Array(width * height).fill(0);
        
        const ITERATIONS = 1000;

        // Simulate placements
        for (let i = 0; i < ITERATIONS; i++) {
            // Pick a random alive ship to try to place
            const shipToPlace = aliveShips[Math.floor(Math.random() * aliveShips.length)];
            
            const x = Math.floor(Math.random() * width);
            const z = Math.floor(Math.random() * height);
            const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;
            
            if (this.canFitShipExperimentally(board, shipToPlace, x, z, orient, match.mode)) {
                // If it fits without contradicting known board state, add heat to those cells
                for (let s = 0; s < shipToPlace.size; s++) {
                    const cx = orient === Orientation.Horizontal ? x + s : x;
                    const cz = orient === Orientation.Vertical ? z + s : z;
                    const idx = cz * width + cx;
                    heatMap[idx]++;
                }
            }
        }

        // Find the cell with the highest heat that hasn't been shot yet
        let maxHeat = -1;
        let bestTarget = { x: -1, z: -1 };

        for (let z = 0; z < height; z++) {
            for (let x = 0; x < width; x++) {
                const idx = z * width + x;
                const state = board.gridState[idx];
                
                // We can only target unrevealed cells
                if (state === CellState.Empty || state === CellState.Ship) {
                    if (heatMap[idx] > maxHeat) {
                        maxHeat = heatMap[idx];
                        bestTarget = { x, z };
                    }
                }
            }
        }

        // If for some reason we couldn't find a target (e.g. Monte Carlo failed to find valid placements in the given iterations)
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
        // First check boundaries
        if (!board.canPlaceShip(ship.size, headX, headZ, orientation)) {
            return false;
        }

        for (let i = 0; i < ship.size; i++) {
            const cx = orientation === Orientation.Horizontal ? headX + i : headX;
            const cz = orientation === Orientation.Vertical ? headZ + i : headZ;
            const idx = cz * board.width + cx;
            const state = board.gridState[idx];

            // AI knows it cannot place a ship where there is a Miss or a Sunk ship
            if (state === CellState.Miss || state === CellState.Sunk) {
                return false;
            }

            // Russian mode adjacency rule: we can't place adjacent to a known Sunk ship
            if (mode === MatchMode.Russian) {
                 for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const nx = cx + dx;
                        const nz = cz + dz;
                        if (board.isOutOfBounds(nx, nz)) continue;
                        const nIdx = nz * board.width + nx;
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
