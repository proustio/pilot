import { Ship, Orientation } from '../fleet/Ship';
import { getIndex } from './BoardUtils';

export enum CellState {
    Empty = 0,
    Miss = 1,
    Ship = 2,
    Hit = 3,
    Sunk = 4
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
    public aliveShipsCount: number = 0;
    
    public shotsFired: number = 0;
    public hits: number = 0;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.gridState = new Uint8Array(width * height);
        this.shipMap = new Map();
    }

    public isOutOfBounds(x: number, z: number): boolean {
        return x < 0 || x >= this.width || z < 0 || z >= this.height;
    }

    public canPlaceShip(shipSize: number, headX: number, headZ: number, orientation: Orientation): boolean {
        for (let i = 0; i < shipSize; i++) {
            const currentX = orientation === Orientation.Horizontal ? headX + i : headX;
            const currentZ = orientation === Orientation.Vertical ? headZ + i : headZ;

            if (this.isOutOfBounds(currentX, currentZ)) {
                return false;
            }

            if (this.gridState[getIndex(currentX, currentZ, this.width)] !== CellState.Empty) {
                return false;
            }
        }
        return true;
    }

    public placeShip(ship: Ship, headX: number, headZ: number, orientation: Orientation): boolean {
        if (!this.canPlaceShip(ship.size, headX, headZ, orientation)) {
            return false;
        }

        ship.placeCoordinate(headX, headZ, orientation);
        this.ships.push(ship);
        if (!ship.isSunk()) {
            this.aliveShipsCount++;
        }

        const coords = ship.getOccupiedCoordinates();
        coords.forEach((coord, segmentIndex) => {
            const mapKey = `${coord.x},${coord.z}`;
            this.gridState[getIndex(coord.x, coord.z, this.width)] = CellState.Ship;
            this.shipMap.set(mapKey, { ship, segmentIndex });
        });

        return true;
    }

    public removeShip(ship: Ship): boolean {
        const index = this.ships.indexOf(ship);
        if (index === -1) return false;

        // Use swap and pop for O(1) removal
        const last = this.ships[this.ships.length - 1];
        this.ships[index] = last;
        this.ships.pop();

        if (!ship.isSunk()) {
            this.aliveShipsCount--;
        }

        const coords = ship.getOccupiedCoordinates();
        coords.forEach(coord => {
            const mapKey = `${coord.x},${coord.z}`;
            this.gridState[getIndex(coord.x, coord.z, this.width)] = CellState.Empty;
            this.shipMap.delete(mapKey);
        });

        return true;
    }

    public receiveAttack(x: number, z: number): AttackResult {
        if (this.isOutOfBounds(x, z)) return AttackResult.Invalid;

        const index = getIndex(x, z, this.width);
        const state = this.gridState[index];

        if (state === CellState.Miss || state === CellState.Hit || state === CellState.Sunk) {
            return AttackResult.Invalid;
        }

        if (state === CellState.Empty) {
            this.shotsFired++;
            this.gridState[index] = CellState.Miss;
            return AttackResult.Miss;
        }

        if (state === CellState.Ship) {
            this.shotsFired++;
            this.hits++;

            const mapKey = `${x},${z}`;
            const target = this.shipMap.get(mapKey);
            if (!target) return AttackResult.Miss;

            const wasSunk = target.ship.isSunk();
            target.ship.hitSegment(target.segmentIndex);
            
            if (!wasSunk && target.ship.isSunk()) {
                this.aliveShipsCount--;
            }

            if (target.ship.isSunk()) {
                const coords = target.ship.getOccupiedCoordinates();
                for (const coord of coords) {
                    this.gridState[getIndex(coord.x, coord.z, this.width)] = CellState.Sunk;
                }
                return AttackResult.Sunk;
            } else {
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
        if (this.ships.length === 0) {
            throw new Error('Board has no ships');
        }
        return this.aliveShipsCount === 0;
    }
}
