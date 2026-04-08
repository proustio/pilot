import { Ship, Orientation } from '../fleet/Ship';
import { getIndex } from './BoardUtils';
import { WeaponSystem } from './WeaponSystem';
import { ShipPlacement } from './ShipPlacement';

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
    Invalid = 'invalid',
}

export class Board {
    public width: number;
    public height: number;

    public gridState: Uint8Array;

    public shipMap: Map<string, { ship: Ship; segmentIndex: number }>;
    public ships: Ship[] = [];
    public aliveShipsCount: number = 0;

    public shotsFired: number = 0;
    public hits: number = 0;

    private weaponSystem = new WeaponSystem();
    private shipPlacement = new ShipPlacement();

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
        return this.shipPlacement.canPlaceShip(this, shipSize, headX, headZ, orientation, ignoredShip);
    }

    public placeShip(ship: Ship, headX: number, headZ: number, orientation: Orientation): boolean {
        return this.shipPlacement.placeShip(this, ship, headX, headZ, orientation);
    }

    public removeShip(ship: Ship): boolean {
        return this.shipPlacement.removeShip(this, ship);
    }

    public moveShip(ship: Ship, newHeadX: number, newHeadZ: number, newOrientation: Orientation): { success: boolean; hitMine: boolean; mineX?: number; mineZ?: number } {
        return this.shipPlacement.moveShip(this, ship, newHeadX, newHeadZ, newOrientation);
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
        return this.weaponSystem.placeMine(this, x, z);
    }

    public placeSonar(x: number, z: number): boolean {
        return this.weaponSystem.placeSonar(this, x, z);
    }

    public sonarPing(centerX: number, centerZ: number, radius: number): { x: number; z: number }[] {
        return this.weaponSystem.sonarPing(this, centerX, centerZ, radius);
    }

    public dispatchAirStrike(startX: number, startZ: number, directionX: -1 | 0 | 1, directionZ: -1 | 0 | 1, length: number = 999): { x: number; z: number; result: AttackResult }[] {
        return this.weaponSystem.dispatchAirStrike(this, startX, startZ, directionX, directionZ, length);
    }
}
