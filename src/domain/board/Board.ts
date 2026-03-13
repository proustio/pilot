import { Ship, Orientation } from '../fleet/Ship';

export enum CellState {
    Empty = 0,
    Miss = 1,
    Ship = 2,
    Hit = 3,         // Hit a specific segment
    Sunk = 4         // Entire ship is destroyed
}

export enum AttackResult {
    Miss = 'miss',
    Hit = 'hit',
    Sunk = 'sunk',
    Invalid = 'invalid', // Already attacked or out of bounds
}

export class Board {
    public width: number;
    public height: number;
    
    // Using a simple 1D array mapped as 2D for memory layout optimizations later if needed.
    // Index = z * width + x
    public gridState: Uint8Array;
    
    // Map of absolute coordinates "x,z" to a specific Ship and its local segment index
    private shipMap: Map<string, { ship: Ship, segmentIndex: number }>;
    public ships: Ship[] = [];
    
    public shotsFired: number = 0;
    public hits: number = 0;

    constructor(width: number = 10, height: number = 10) {
        this.width = width;
        this.height = height;
        this.gridState = new Uint8Array(width * height);
        this.shipMap = new Map();
    }

    private getIndex(x: number, z: number): number {
        return z * this.width + x;
    }

    public isOutOfBounds(x: number, z: number): boolean {
        return x < 0 || x >= this.width || z < 0 || z >= this.height;
    }

    /**
     * Validates if a ship can be placed at the specified coordinate.
     * Takes boundary limits and overlapping into account.
     * Adjacency (touching) rules can be injected later by the RuleEngine.
     * For now, strict bounds and collision checking.
     */
    public canPlaceShip(shipSize: number, headX: number, headZ: number, orientation: Orientation): boolean {
        for (let i = 0; i < shipSize; i++) {
            const currentX = orientation === Orientation.Horizontal ? headX + i : headX;
            const currentZ = orientation === Orientation.Vertical ? headZ + i : headZ;

            // 1. Boundary check
            if (this.isOutOfBounds(currentX, currentZ)) {
                return false;
            }

            // 2. Occupancy/Collision check
            if (this.gridState[this.getIndex(currentX, currentZ)] !== CellState.Empty) {
                return false;
            }
        }
        return true;
    }

    /**
     * Attempts to place a Ship entity on the board.
     * If successful, it updates the grid state and stores the map reference.
     * @returns True if successful, false if illegal placement.
     */
    public placeShip(ship: Ship, headX: number, headZ: number, orientation: Orientation): boolean {
        if (!this.canPlaceShip(ship.size, headX, headZ, orientation)) {
            return false;
        }

        ship.placeCoordinate(headX, headZ, orientation);
        this.ships.push(ship);

        const coords = ship.getOccupiedCoordinates();
        coords.forEach((coord, segmentIndex) => {
            const mapKey = `${coord.x},${coord.z}`;
            this.gridState[this.getIndex(coord.x, coord.z)] = CellState.Ship;
            this.shipMap.set(mapKey, { ship, segmentIndex });
        });

        return true;
    }

    /**
     * Receives an attack on the coordinate.
     */
    public receiveAttack(x: number, z: number): AttackResult {
        if (this.isOutOfBounds(x, z)) return AttackResult.Invalid;

        const index = this.getIndex(x, z);
        const state = this.gridState[index];

        // Ensure we don't attack already resolved cells
        if (state === CellState.Miss || state === CellState.Hit || state === CellState.Sunk) {
            return AttackResult.Invalid; // Duplicate attack
        }

        if (state === CellState.Empty) {
            this.shotsFired++;
            this.gridState[index] = CellState.Miss;
            return AttackResult.Miss;
        }

        if (state === CellState.Ship) {
            this.shotsFired++;
            this.hits++;
            // Retrieve ship metadata
            const mapKey = `${x},${z}`;
            const target = this.shipMap.get(mapKey);
            if (!target) return AttackResult.Miss; // Fallback anomaly

            target.ship.hitSegment(target.segmentIndex);
            
            if (target.ship.isSunk()) {
                // Update all cells relating to this ship to 'Sunk'
                const coords = target.ship.getOccupiedCoordinates();
                for (const coord of coords) {
                    this.gridState[this.getIndex(coord.x, coord.z)] = CellState.Sunk;
                }
                return AttackResult.Sunk;
            } else {
                // Just a Hit
                this.gridState[index] = CellState.Hit;
                return AttackResult.Hit;
            }
        }

        return AttackResult.Invalid;
    }
    
    /**
     * Checks if all ships placed on this board are sunk.
     */
    public allShipsSunk(): boolean {
        if (this.ships.length === 0) return false;
        return this.ships.every(ship => ship.isSunk());
    }
}
