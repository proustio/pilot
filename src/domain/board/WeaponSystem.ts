import { Ship, Orientation } from '../fleet/Ship';
import { CellState, AttackResult } from './Board';
import type { Board } from './Board';
import { getIndex } from './BoardUtils';

export class WeaponSystem {
    public placeMine(board: Board, x: number, z: number): boolean {
        if (board.isOutOfBounds(x, z)) return false;
        if (board.gridState[getIndex(x, z, board.width)] !== CellState.Empty) return false;

        const mine = new Ship(`mine_${Date.now()}_${x}_${z}`, 1);
        mine.isSpecialWeapon = true;
        mine.specialType = 'mine';
        return board.placeShip(mine, x, z, Orientation.Horizontal);
    }

    public placeSonar(board: Board, x: number, z: number): boolean {
        if (board.isOutOfBounds(x, z)) return false;
        if (board.gridState[getIndex(x, z, board.width)] !== CellState.Empty) return false;

        const sonar = new Ship(`sonar_${Date.now()}_${x}_${z}`, 1);
        sonar.isSpecialWeapon = true;
        sonar.specialType = 'sonar';
        sonar.visionRadius = 7;
        return board.placeShip(sonar, x, z, Orientation.Horizontal);
    }

    public sonarPing(board: Board, centerX: number, centerZ: number, radius: number): { x: number; z: number }[] {
        const found: { x: number; z: number }[] = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const x = centerX + dx;
                const z = centerZ + dz;
                if (!board.isOutOfBounds(x, z)) {
                    if (Math.abs(dx) + Math.abs(dz) <= radius) {
                        const state = board.gridState[getIndex(x, z, board.width)];
                        if (state === CellState.Ship || state === CellState.Hit || state === CellState.Sunk) {
                            found.push({ x, z });
                        }
                    }
                }
            }
        }
        return found;
    }

    public dispatchAirStrike(
        board: Board,
        startX: number, startZ: number,
        directionX: -1 | 0 | 1, directionZ: -1 | 0 | 1,
        length: number = 999
    ): { x: number; z: number; result: AttackResult }[] {
        const results: { x: number; z: number; result: AttackResult }[] = [];
        let cx = startX, cz = startZ, count = 0;
        while (!board.isOutOfBounds(cx, cz) && count < length) {
            const res = board.receiveAttack(cx, cz);
            results.push({ x: cx, z: cz, result: res });
            cx += directionX; cz += directionZ; count++;
        }
        return results;
    }
}
