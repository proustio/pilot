import { Ship, Orientation } from '../fleet/Ship';
import { CellState } from './Board';
import type { Board } from './Board';
import { getIndex } from './BoardUtils';

export class ShipPlacement {
    public canPlaceShip(board: Board, shipSize: number, headX: number, headZ: number, orientation: Orientation, ignoredShip?: Ship): boolean {
        for (let i = 0; i < shipSize; i++) {
            let currentX: number;
            let currentZ: number;
            if (orientation === Orientation.Horizontal) {
                currentX = headX + i; currentZ = headZ;
            } else if (orientation === Orientation.Vertical) {
                currentX = headX; currentZ = headZ + i;
            } else if (orientation === Orientation.Left) {
                currentX = headX - i; currentZ = headZ;
            } else { // Orientation.Up
                currentX = headX; currentZ = headZ - i;
            }

            if (board.isOutOfBounds(currentX, currentZ)) return false;

            const state = board.gridState[getIndex(currentX, currentZ, board.width)];
            if (state !== CellState.Empty && state !== CellState.Mine) {
                if (state === CellState.Ship || state === CellState.Hit || state === CellState.Sunk) {
                    const existingShip = board.getShipAt(currentX, currentZ);
                    if (existingShip && existingShip === ignoredShip) {
                        continue;
                    }
                }
                return false;
            }
        }
        return true;
    }

    public placeShip(board: Board, ship: Ship, headX: number, headZ: number, orientation: Orientation): boolean {
        if (!this.canPlaceShip(board, ship.size, headX, headZ, orientation)) return false;

        ship.placeCoordinate(headX, headZ, orientation);
        board.ships.push(ship);
        if (!ship.isSunk() && !ship.isSpecialWeapon) {
            board.aliveShipsCount++;
        }

        const coords = ship.getOccupiedCoordinates();
        coords.forEach((coord, segmentIndex) => {
            const mapKey = `${coord.x},${coord.z}`;
            board.gridState[getIndex(coord.x, coord.z, board.width)] = ship.specialType === 'mine' ? CellState.Mine : CellState.Ship;
            board.shipMap.set(mapKey, { ship, segmentIndex });
        });

        return true;
    }

    public removeShip(board: Board, ship: Ship): boolean {
        const index = board.ships.indexOf(ship);
        if (index === -1) return false;

        board.ships[index] = board.ships[board.ships.length - 1];
        board.ships.pop();

        if (!ship.isSunk() && !ship.isSpecialWeapon) {
            board.aliveShipsCount--;
        }

        const coords = ship.getOccupiedCoordinates();
        coords.forEach(coord => {
            const mapKey = `${coord.x},${coord.z}`;
            board.gridState[getIndex(coord.x, coord.z, board.width)] = CellState.Empty;
            board.shipMap.delete(mapKey);
        });

        return true;
    }

    public moveShip(board: Board, ship: Ship, newHeadX: number, newHeadZ: number, newOrientation: Orientation): { success: boolean; hitMine: boolean; mineX?: number; mineZ?: number } {
        if (!board.ships.includes(ship)) return { success: false, hitMine: false };

        const oldCoords = ship.getOccupiedCoordinates();
        oldCoords.forEach(coord => {
            const mapKey = `${coord.x},${coord.z}`;
            board.gridState[getIndex(coord.x, coord.z, board.width)] = CellState.Empty;
            board.shipMap.delete(mapKey);
        });

        if (!this.canPlaceShip(board, ship.size, newHeadX, newHeadZ, newOrientation)) {
            oldCoords.forEach((coord, segmentIndex) => {
                const mapKey = `${coord.x},${coord.z}`;
                board.gridState[getIndex(coord.x, coord.z, board.width)] = ship.specialType === 'mine' ? CellState.Mine : CellState.Ship;
                board.shipMap.set(mapKey, { ship, segmentIndex });
            });
            return { success: false, hitMine: false };
        }

        ship.headX = newHeadX;
        ship.headZ = newHeadZ;
        ship.orientation = newOrientation;

        let hitMine = false;
        let mineX: number | undefined, mineZ: number | undefined;
        const newCoords = ship.getOccupiedCoordinates();

        // 1. Check for immediate landing on a mine
        newCoords.forEach((coord, segmentIndex) => {
            const idx = getIndex(coord.x, coord.z, board.width);
            const state = board.gridState[idx];
            if (state === CellState.Mine) {
                const mineShip = board.getShipAt(coord.x, coord.z);
                if (mineShip && mineShip.specialType === 'mine') {
                    hitMine = true;
                    mineX = coord.x;
                    mineZ = coord.z;
                    ship.hitSegment(segmentIndex);
                    mineShip.hitSegment(0);
                    board.gridState[idx] = ship.isSunk() ? CellState.Sunk : CellState.Hit;
                }
            } else {
                board.gridState[idx] = CellState.Ship;
            }
            board.shipMap.set(`${coord.x},${coord.z}`, { ship, segmentIndex });
        });

        if (hitMine && ship.isSunk()) {
            if (!ship.isSpecialWeapon) board.aliveShipsCount--;
            newCoords.forEach((coord) => {
                board.gridState[getIndex(coord.x, coord.z, board.width)] = CellState.Sunk;
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
                        if (board.isOutOfBounds(rx, rz)) continue;

                        const state = board.gridState[getIndex(rx, rz, board.width)];
                        if (state === CellState.Mine) {
                            const mineShip = board.getShipAt(rx, rz);
                            if (mineShip && mineShip.specialType === 'mine') {
                                hitMine = true;
                                mineX = rx;
                                mineZ = rz;
                                ship.hitSegment(0);
                                mineShip.hitSegment(0);
                                board.gridState[getIndex(rx, rz, board.width)] = CellState.Sunk;
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
}
