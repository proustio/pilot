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
        
        let targetX = ship.headX;
        let targetZ = ship.headZ;
        let targetOrient = ship.orientation;

        if (isEasy) {
            if (detectedEnemy) {
                // Move towards detected enemy
                const dx = Math.sign(detectedEnemy.x - ship.headX);
                const dz = Math.sign(detectedEnemy.z - ship.headZ);
                targetX = ship.headX + dx;
                targetZ = ship.headZ + dz;
            } else {
                // Search: Move towards player quadrant center [3, 3]
                const dx = Math.sign(3 - ship.headX);
                const dz = Math.sign(3 - ship.headZ);
                
                // Deterministic step for search in tests, but allow some variety
                if (dx !== 0) targetX = ship.headX + dx;
                else if (dz !== 0) targetZ = ship.headZ + dz;
            }
        } else {
            // Normal AI: Evasive/Tactical
            const isDamaged = ship.segments.some(s => !s);
            if (isDamaged) {
                // Move away from current hits/detected enemies
                targetX = ship.headX + (Math.random() > 0.5 ? 5 : -5);
                targetZ = ship.headZ + (Math.random() > 0.5 ? 5 : -5);
            } else if (detectedEnemy) {
                // Tactical: maintain distance 8-10
                const dist = this.getDistance(ship.headX, ship.headZ, detectedEnemy.x, detectedEnemy.z);
                if (dist < 8) {
                    // Back away
                    targetX = ship.headX - Math.sign(detectedEnemy.x - ship.headX);
                    targetZ = ship.headZ - Math.sign(detectedEnemy.z - ship.headZ);
                } else if (dist > 10) {
                    // Close in
                    targetX = ship.headX + Math.sign(detectedEnemy.x - ship.headX);
                    targetZ = ship.headZ + Math.sign(detectedEnemy.z - ship.headZ);
                } else {
                    // Already at good range, maybe lateral?
                    targetX = ship.headX + (Math.random() > 0.5 ? 1 : -1);
                    targetZ = ship.headZ + (Math.random() > 0.5 ? 1 : -1);
                }
            } else {
                // Patrol player half
                targetX = Math.floor(Math.random() * 10);
                targetZ = Math.floor(Math.random() * 10);
            }
        }

        // Keep within board bounds
        targetX = Math.max(0, Math.min(board.width - 1, targetX));
        targetZ = Math.max(0, Math.min(board.height - 1, targetZ));

        // Validate if it can fit. 
        if (match.validatePlacement(board, ship, targetX, targetZ, targetOrient, ship)) {
            if (targetX === ship.headX && targetZ === ship.headZ) return null;
            return { x: targetX, z: targetZ, orientation: targetOrient };
        } else {
             // Try variations if direct move blocked
             const offsets = [[1,0], [-1,0], [0,1], [0,-1]];
             for (const [ox, oz] of offsets) {
                 const tx = Math.max(0, Math.min(board.width - 1, ship.headX + ox));
                 const tz = Math.max(0, Math.min(board.height - 1, ship.headZ + oz));
                 if (match.validatePlacement(board, ship, tx, tz, targetOrient, ship)) {
                     return { x: tx, z: tz, orientation: targetOrient };
                 }
             }
        }

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
        
        while (!valid) {
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
