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
    
    public gridState: Uint8Array;
    
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

    public canPlaceShip(shipSize: number, headX: number, headZ: number, orientation: Orientation, ignoredShip?: Ship): boolean {
        for (let i = 0; i < shipSize; i++) {
            const currentX = orientation === Orientation.Horizontal ? headX + i : headX;
            const currentZ = orientation === Orientation.Vertical ? headZ + i : headZ;

            if (this.isOutOfBounds(currentX, currentZ)) return false;

            const state = this.gridState[getIndex(currentX, currentZ, this.width)];
            if (state !== CellState.Empty && state !== CellState.Mine) {
                // If it's a ship, check if it's the one we're ignoring
                if (state === CellState.Ship || state === CellState.Hit || state === CellState.Sunk) {
                    const existingShip = this.getShipAt(currentX, currentZ);
                    if (existingShip && existingShip === ignoredShip) {
                        continue; // This segment belongs to the ship we're moving
                    }
                }
                return false;
            }
        }
        return true;
    }

    public placeShip(ship: Ship, headX: number, headZ: number, orientation: Orientation): boolean {
        if (!this.canPlaceShip(ship.size, headX, headZ, orientation)) return false;

        ship.placeCoordinate(headX, headZ, orientation);
        this.ships.push(ship);
        if (!ship.isSunk() && !ship.isSpecialWeapon) {
            this.aliveShipsCount++;
        }

        const coords = ship.getOccupiedCoordinates();
        coords.forEach((coord, segmentIndex) => {
            const mapKey = `${coord.x},${coord.z}`;
            this.gridState[getIndex(coord.x, coord.z, this.width)] = ship.specialType === 'mine' ? CellState.Mine : CellState.Ship;
            this.shipMap.set(mapKey, { ship, segmentIndex });
        });

        return true;
    }

    public removeShip(ship: Ship): boolean {
        const index = this.ships.indexOf(ship);
        if (index === -1) return false;

        this.ships[index] = this.ships[this.ships.length - 1];
        this.ships.pop();

        if (!ship.isSunk() && !ship.isSpecialWeapon) {
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

    public moveShip(ship: Ship, newHeadX: number, newHeadZ: number, newOrientation: Orientation): { success: boolean, hitMine: boolean, mineX?: number, mineZ?: number } {
        if (!this.ships.includes(ship)) return { success: false, hitMine: false };

        const oldCoords = ship.getOccupiedCoordinates();
        oldCoords.forEach(coord => {
            const mapKey = `${coord.x},${coord.z}`;
            this.gridState[getIndex(coord.x, coord.z, this.width)] = CellState.Empty;
            this.shipMap.delete(mapKey);
        });

        if (!this.canPlaceShip(ship.size, newHeadX, newHeadZ, newOrientation)) {
            oldCoords.forEach((coord, segmentIndex) => {
                const mapKey = `${coord.x},${coord.z}`;
                this.gridState[getIndex(coord.x, coord.z, this.width)] = ship.specialType === 'mine' ? CellState.Mine : CellState.Ship;
                this.shipMap.set(mapKey, { ship, segmentIndex });
            });
            return { success: false, hitMine: false };
        }

        ship.headX = newHeadX;
        ship.headZ = newHeadZ;
        ship.orientation = newOrientation;

        let hitMine = false;
        let mineX, mineZ;
        const newCoords = ship.getOccupiedCoordinates();
        
        // 1. Check for immediate landing on a mine
        newCoords.forEach((coord, segmentIndex) => {
            const idx = getIndex(coord.x, coord.z, this.width);
            const state = this.gridState[idx];
            if (state === CellState.Mine) {
                const mineShip = this.getShipAt(coord.x, coord.z);
                if (mineShip && mineShip.specialType === 'mine') {
                    hitMine = true;
                    mineX = coord.x;
                    mineZ = coord.z;
                    ship.hitSegment(segmentIndex);
                    mineShip.hitSegment(0);
                    this.gridState[idx] = ship.isSunk() ? CellState.Sunk : CellState.Hit;
                }
            } else {
                this.gridState[idx] = CellState.Ship;
            }
            this.shipMap.set(`${coord.x},${coord.z}`, { ship, segmentIndex });
        });

        if (hitMine && ship.isSunk()) {
            if (!ship.isSpecialWeapon) this.aliveShipsCount--;
            newCoords.forEach((coord) => {
                this.gridState[getIndex(coord.x, coord.z, this.width)] = CellState.Sunk;
            });
        }

        // 2. Check for ADJACENT mines after moving
        if (!hitMine) {
            for (const coord of newCoords) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        if (dx === 0 && dz === 0) continue;
                        const rx = coord.x + dx;
                        const rz = coord.z + dz;
                        if (this.isOutOfBounds(rx, rz)) continue;
                        
                        const state = this.gridState[getIndex(rx, rz, this.width)];
                        if (state === CellState.Mine) {
                            const mineShip = this.getShipAt(rx, rz);
                            if (mineShip && mineShip.specialType === 'mine') {
                                hitMine = true;
                                mineX = rx;
                                mineZ = rz;
                                ship.hitSegment(0); 
                                mineShip.hitSegment(0); 
                                this.gridState[getIndex(rx, rz, this.width)] = CellState.Sunk;
                                break;
                            }
                        }
                    }
                    if (hitMine) break;
                }
                if (hitMine) break;
            }
        }

        return { success: true, hitMine, mineX, mineZ };
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

        if (state === CellState.Empty) {
            this.shotsFired++;
            this.gridState[index] = CellState.Miss;
            return AttackResult.Miss;
        }

        if (state === CellState.Ship || state === CellState.Mine) {
            this.shotsFired++;
            this.hits++;

            const mapKey = `${x},${z}`;
            const target = this.shipMap.get(mapKey);
            if (!target) return AttackResult.Miss;

            const wasSunk = target.ship.isSunk();
            target.ship.hitSegment(target.segmentIndex);
            
            if (!wasSunk && target.ship.isSunk() && !target.ship.isSpecialWeapon) {
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
    
    public allShipsSunk(): boolean {
        if (this.ships.length === 0) throw new Error('Board has no ships');
        return this.aliveShipsCount === 0;
    }

    public placeMine(x: number, z: number): boolean {
        if (this.isOutOfBounds(x, z)) return false;
        if (this.gridState[getIndex(x, z, this.width)] !== CellState.Empty) return false;

        const mine = new Ship(`mine_${Date.now()}_${x}_${z}`, 1);
        mine.isSpecialWeapon = true;
        mine.specialType = 'mine';
        return this.placeShip(mine, x, z, Orientation.Horizontal);
    }

    public placeSonar(x: number, z: number): boolean {
        if (this.isOutOfBounds(x, z)) return false;
        if (this.gridState[getIndex(x, z, this.width)] !== CellState.Empty) return false;

        const sonar = new Ship(`sonar_${Date.now()}_${x}_${z}`, 1);
        sonar.isSpecialWeapon = true;
        sonar.specialType = 'sonar';
        sonar.visionRadius = 7;
        return this.placeShip(sonar, x, z, Orientation.Horizontal);
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

    public dispatchAirStrike(startX: number, startZ: number, directionX: -1|0|1, directionZ: -1|0|1, length: number = 999): { x: number, z: number, result: AttackResult }[] {
        const results: { x: number, z: number, result: AttackResult }[] = [];
        let cx = startX, cz = startZ, count = 0;
        while (!this.isOutOfBounds(cx, cz) && count < length) {
            const res = this.receiveAttack(cx, cz);
            results.push({ x: cx, z: cz, result: res });
            cx += directionX; cz += directionZ; count++;
        }
        return results;
    }
}
