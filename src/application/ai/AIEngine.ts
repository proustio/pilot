import { Board, CellState, AttackResult } from '../../domain/board/Board';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { MatchMode, Match } from '../../domain/match/Match';
import { getIndex } from '../../domain/board/BoardUtils';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export class AIEngine {
    public difficulty: AIDifficulty = 'easy';
    
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
     * Decides whether the AI ship should move or attack.
     * Return 'move' | 'attack' | 'skip'
     */
    public decideAction(ship: Ship, board: Board, _match: Match): 'move' | 'attack' | 'skip' {
        if (ship.hasActedThisTurn) return 'skip';

        // Check if any player ship is detected within vision or attack range
        const visibleEnemy = this.findVisibleEnemyInRange(ship, board, 10);

        if (this.difficulty === 'easy') {
            // Easy: If enemy in range 10, attack. Otherwise, move to search.
            return (visibleEnemy && this.getDistance(ship.headX, ship.headZ, visibleEnemy.x, visibleEnemy.z) <= 10) ? 'attack' : 'move';
        } else {
            // Normal: If hit recently (damaged), move defensively.
            const isDamaged = ship.segments.some(s => !s);
            if (isDamaged) return 'move'; 
            
            // If enemy in range, attack. Else move.
            return (visibleEnemy && this.getDistance(ship.headX, ship.headZ, visibleEnemy.x, visibleEnemy.z) <= 10) ? 'attack' : 'move';
        }
    }

    /**
     * Computes the next movement target for an AI ship.
     */
    public computeMove(ship: Ship, board: Board, match: Match): { x: number, z: number, orientation: Orientation } | null {
        if (ship.movesRemaining <= 0) return null;

        const isEasy = this.difficulty === 'easy';
        const detectedEnemy = this.findVisibleEnemyInRange(ship, board, ship.visionRadius + 5); 
        
        let bestTarget: { x: number, z: number, orientation: Orientation } | null = null;
        let minDistanceToGoal = Infinity;

        // Determine goal: detected enemy or quadrant center [3,3]
        const goalX = detectedEnemy ? detectedEnemy.x : 3;
        const goalZ = detectedEnemy ? detectedEnemy.z : 3;

        // Search for best valid move within reach
        // We look at cells within a radius equal to current moves (approximate)
        const radius = Math.ceil(ship.movesRemaining / 0.5); 
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const tx = ship.headX + dx;
                const tz = ship.headZ + dz;

                if (board.isOutOfBounds(tx, tz)) continue;
                if (tx === ship.headX && tz === ship.headZ) continue;

                const cost = ship.calculateMoveCost(tx, tz);
                if (cost > 0 && cost <= ship.movesRemaining) {
                    const orients = [ship.orientation, ship.orientation === Orientation.Horizontal ? Orientation.Vertical : Orientation.Horizontal];
                    for (const orient of orients) {
                        if (match.validatePlacement(board, ship, tx, tz, orient, ship)) {
                            const dist = this.getDistance(tx, tz, goalX, goalZ);
                            let score: number;

                            if (isEasy || !detectedEnemy) {
                                // Simple approach for easy AI or when just searching
                                score = dist + (isEasy ? Math.random() * 2 : 0);
                            } else {
                                // Tactical range: 8-10 cells
                                if (dist < 8) {
                                    // Too close, move away (punish small distances)
                                    score = 20 - dist; 
                                } else if (dist > 10) {
                                    // Too far, close in
                                    score = dist;
                                } else {
                                    // Ideal range, stay here
                                    score = 0;
                                }
                            }

                            if (score < minDistanceToGoal) {
                                minDistanceToGoal = score;
                                bestTarget = { x: tx, z: tz, orientation: orient };
                            }
                        }
                    }
                }
            }
        }

        return bestTarget;

        return null;
    }

    private getDistance(x1: number, z1: number, x2: number, z2: number): number {
        return Math.max(Math.abs(x1 - x2), Math.abs(z1 - z2)); // Chebyshev
    }

    private findVisibleEnemyInRange(ship: Ship, board: Board, range: number): { x: number, z: number } | null {
        // AI "sees" player ships that are within its visionRadius or were previously hit
        for (const playerShip of board.ships) {
            if (playerShip.isEnemy) continue;
            if (playerShip.isSunk()) continue;

            const coords = playerShip.getOccupiedCoordinates();
            for (const c of coords) {
                const dist = this.getDistance(ship.headX, ship.headZ, c.x, c.z);
                if (dist <= range) {
                    // Detect if within ship's actual vision radius OR already hit
                    const idx = getIndex(c.x, c.z, board.width);
                    const state = board.gridState[idx];
                    if (state === CellState.Hit || dist <= ship.visionRadius) {
                        return { x: c.x, z: c.z };
                    }
                }
            }
        }
        return null;
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


    private computeEasyMove(board: Board): {x: number, z: number} {
        let x = 0;
        let z = 0;
        let valid = false;
        let attempts = 0;
        const maxAttempts = board.width * board.height * 2;
        
        while (!valid && attempts < maxAttempts) {
            attempts++;
            x = Math.floor(Math.random() * board.width);
            z = Math.floor(Math.random() * board.height);
            
            const idx = getIndex(x, z, board.width);
            const state = board.gridState[idx];
            
            if (state === CellState.Empty || state === CellState.Ship) {
                // In Rogue mode (shared board), don't shoot own ships
                const ship = board.ships.find(s => s.occupies(x, z));
                if (ship && ship.isEnemy) {
                    continue; // skip own ship
                }
                valid = true;
            }
        }
        
        // If no valid move found after many attempts, pick first available empty/ship cell
        if (!valid) {
            for (let i = 0; i < board.gridState.length; i++) {
                const state = board.gridState[i];
                if (state === CellState.Empty || state === CellState.Ship) {
                    const tx = i % board.width;
                    const tz = Math.floor(i / board.width);
                    const ship = board.ships.find(s => s.occupies(tx, tz));
                    if (!(ship && ship.isEnemy)) {
                        return { x: tx, z: tz };
                    }
                }
            }
        }
        
        return { x, z };
    }

    private computeNormalMove(board: Board): {x: number, z: number} {
        while (this.huntStack.length > 0) {
            const target = this.huntStack.pop()!;
            
            // In Rogue mode (shared board), don't shoot own ships from hunt stack
            const ship = board.ships.find(s => s.occupies(target.x, target.z));
            if (ship && ship.isEnemy) {
                continue; 
            }

            const idx = getIndex(target.x, target.z, board.width);
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
                    const ship = board.ships.find(s => s.occupies(x, z));
                    if (ship && ship.isEnemy) continue; // Skip own ship in heat map
                    
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

        // Rogue mode: Player (isEnemy=false) in Top-Left (0-6, 0-6), AI in Bottom-Right (13-19, 13-19)
        if (mode === MatchMode.Rogue) {
            const shipTailX = orientation === Orientation.Horizontal ? headX + ship.size - 1 : headX;
            const shipTailZ = orientation === Orientation.Vertical ? headZ + ship.size - 1 : headZ;
            
            if (ship.isEnemy === true) {
                // Enemy must be in Bottom-Right quadrant (13-19, 13-19)
                if (headX < 13 || headZ < 13) return false;
            } else {
                // Player must be in Top-Left quadrant (0-6, 0-6)
                if (shipTailX >= 7 || shipTailZ >= 7) return false;
            }
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
