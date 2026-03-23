import { Ship, Orientation } from '../fleet/Ship';
import { getIndex } from './BoardUtils';

export enum CellState {
    Empty = 0,
    Miss = 1,
    Ship = 2,
    Hit = 3,
    Sunk = 4,
    Mine = 5
}

export enum WeaponType {
    Cannon = 'cannon',
    Mine = 'mine',
    Sonar = 'sonar',
    AirStrike = 'airstrike'
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

            const state = this.gridState[getIndex(currentX, currentZ, this.width)];
            if (state !== CellState.Empty && state !== CellState.Mine) {
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

    public moveShip(ship: Ship, newHeadX: number, newHeadZ: number, newOrientation: Orientation): boolean {
        // Validation check for ship exists on board
        if (!this.ships.includes(ship)) return false;

        // Temporarily clear old cells so ship doesn't collide with itself
        const oldCoords = ship.getOccupiedCoordinates();
        oldCoords.forEach(coord => {
            const mapKey = `${coord.x},${coord.z}`;
            this.gridState[getIndex(coord.x, coord.z, this.width)] = CellState.Empty;
            this.shipMap.delete(mapKey);
        });

        // Test placement
        if (!this.canPlaceShip(ship.size, newHeadX, newHeadZ, newOrientation)) {
            // Revert cells since invalid
            oldCoords.forEach((coord, segmentIndex) => {
                const mapKey = `${coord.x},${coord.z}`;
                this.gridState[getIndex(coord.x, coord.z, this.width)] = CellState.Ship;
                this.shipMap.set(mapKey, { ship, segmentIndex });
            });
            return false;
        }

        // Apply new placement
        ship.headX = newHeadX;
        ship.headZ = newHeadZ;
        ship.orientation = newOrientation;

        let hitMine = false;
        const newCoords = ship.getOccupiedCoordinates();
        newCoords.forEach((coord, segmentIndex) => {
            const idx = getIndex(coord.x, coord.z, this.width);
            const state = this.gridState[idx];
            if (state === CellState.Mine) {
                hitMine = true;
                ship.hitSegment(segmentIndex);
                this.gridState[idx] = ship.isSunk() ? CellState.Sunk : CellState.Hit;
            } else {
                this.gridState[idx] = CellState.Ship;
            }
            this.shipMap.set(`${coord.x},${coord.z}`, { ship, segmentIndex });
        });

        if (hitMine && ship.isSunk()) {
            this.aliveShipsCount--;
            newCoords.forEach((coord) => {
                this.gridState[getIndex(coord.x, coord.z, this.width)] = CellState.Sunk;
            });
        }

        return true;
    }

    public getShipAt(x: number, z: number): Ship | undefined {
        return this.shipMap.get(`${x},${z}`)?.ship;
    }

    public receiveAttack(x: number, z: number): AttackResult {
        if (this.isOutOfBounds(x, z)) return AttackResult.Invalid;

        const index = getIndex(x, z, this.width);
        const state = this.gridState[index];

        if (state === CellState.Miss || state === CellState.Hit || state === CellState.Sunk) {
            return AttackResult.Invalid;
        }

        if (state === CellState.Empty || state === CellState.Mine) {
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

    public placeMine(x: number, z: number): boolean {
        if (this.isOutOfBounds(x, z)) return false;
        const index = getIndex(x, z, this.width);
        if (this.gridState[index] === CellState.Empty) {
            this.gridState[index] = CellState.Mine;
            return true;
        }
        return false;
    }

    public sonarPing(centerX: number, centerZ: number, radius: number): { x: number, z: number }[] {
        const found: { x: number, z: number }[] = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const x = centerX + dx;
                const z = centerZ + dz;
                if (!this.isOutOfBounds(x, z)) {
                    if (Math.abs(dx) + Math.abs(dz) <= radius) {
                        const state = this.gridState[getIndex(x, z, this.width)];
                        if (state === CellState.Ship || state === CellState.Hit || state === CellState.Sunk) {
                            found.push({ x, z });
                        }
                    }
                }
            }
        }
        return found;
    }

    public dispatchAirStrike(startX: number, startZ: number, directionX: -1|0|1, directionZ: -1|0|1): { x: number, z: number, result: AttackResult }[] {
        const results: { x: number, z: number, result: AttackResult }[] = [];
        let cx = startX;
        let cz = startZ;
        while (!this.isOutOfBounds(cx, cz)) {
            const res = this.receiveAttack(cx, cz);
            results.push({ x: cx, z: cz, result: res });
            cx += directionX;
            cz += directionZ;
        }
        return results;
    }
}
