import { Ship, Orientation } from '../fleet/Ship';
import { Board, CellState } from './Board';
import { getIndex } from './BoardUtils';

export interface PathCell {
    x: number;
    z: number;
}

export interface PathResult {
    /** Cells the ship actually traverses (may be shorter than requested) */
    path: PathCell[];
    /** Final head position */
    finalX: number;
    finalZ: number;
    /** If movement was stopped by a mine */
    hitMine: boolean;
    mineX?: number;
    mineZ?: number;
    /** If movement was stopped by ramming another ship */
    rammed: boolean;
    rammedShip?: Ship;
    /** The cell where collision occurred (the blocked cell itself) */
    collisionCell?: PathCell;
}

export class PathResolver {

    /**
     * Returns ordered intermediate cells between two points.
     * Uses axis-aligned stepping: primary axis (larger delta) first, then secondary.
     * Does NOT include the starting cell — only cells the head moves into.
     */
    public computeCellPath(
        fromX: number, fromZ: number,
        toX: number, toZ: number
    ): PathCell[] {
        const path: PathCell[] = [];
        let cx = fromX;
        let cz = fromZ;

        const dx = toX - fromX;
        const dz = toZ - fromZ;
        const absDx = Math.abs(dx);
        const absDz = Math.abs(dz);
        const stepX = dx > 0 ? 1 : -1;
        const stepZ = dz > 0 ? 1 : -1;

        // Primary axis first (larger delta), then secondary
        if (absDx >= absDz) {
            // Step along X first
            for (let i = 0; i < absDx; i++) {
                cx += stepX;
                path.push({ x: cx, z: cz });
            }
            // Then step along Z
            for (let i = 0; i < absDz; i++) {
                cz += stepZ;
                path.push({ x: cx, z: cz });
            }
        } else {
            // Step along Z first
            for (let i = 0; i < absDz; i++) {
                cz += stepZ;
                path.push({ x: cx, z: cz });
            }
            // Then step along X
            for (let i = 0; i < absDx; i++) {
                cx += stepX;
                path.push({ x: cx, z: cz });
            }
        }

        return path;
    }

    /**
     * Checks if a cell is impassable (occupied by another ship, or CellState.Sunk).
     * Ignores the moving ship's own cells.
     * Returns the blocking ship if the blocker is a non-sunk ship (for ramming).
     */
    public isCellBlocked(
        board: Board,
        x: number, z: number,
        movingShip: Ship
    ): { blocked: boolean; blockingShip?: Ship } {
        if (board.isOutOfBounds(x, z)) {
            return { blocked: true };
        }

        const index = getIndex(x, z, board.width);
        const state = board.gridState[index];

        // Sunk cells are always impassable
        if (state === CellState.Sunk) {
            return { blocked: true };
        }

        // Check for ship occupancy
        if (state === CellState.Ship || state === CellState.Hit) {
            const occupant = board.getShipAt(x, z);
            if (occupant && occupant !== movingShip) {
                return { blocked: true, blockingShip: occupant };
            }
        }

        return { blocked: false };
    }

    /**
     * Computes the ordered path from ship's current position to (targetX, targetZ).
     * Walks cell-by-cell, checking each for:
     *   1. Out-of-bounds → stop at last valid cell
     *   2. Impassable entity (ship, dead ship, Sunk cell) → ramming or stop
     *   3. Mine → detonate, stop
     * Does NOT mutate board state — caller applies results.
     */
    public resolve(
        board: Board,
        ship: Ship,
        targetX: number,
        targetZ: number,
        newOrientation: Orientation
    ): PathResult {
        const startX = ship.headX;
        const startZ = ship.headZ;

        const emptyResult: PathResult = {
            path: [],
            finalX: startX,
            finalZ: startZ,
            hitMine: false,
            rammed: false,
        };

        // Compute the full ideal path for the head
        const fullPath = this.computeCellPath(startX, startZ, targetX, targetZ);
        if (fullPath.length === 0) return emptyResult;

        const traversed: PathCell[] = [];

        for (const cell of fullPath) {
            // Check every cell the ship's body would occupy at this head position
            const bodyCheck = this.checkShipFootprint(
                board, ship, cell.x, cell.z, newOrientation
            );

            if (bodyCheck.outOfBounds) {
                // Stop at last valid position
                break;
            }

            if (bodyCheck.hitMine) {
                // Ship moves INTO the mine cell, then stops
                traversed.push(cell);
                return {
                    path: traversed,
                    finalX: cell.x,
                    finalZ: cell.z,
                    hitMine: true,
                    mineX: bodyCheck.mineX,
                    mineZ: bodyCheck.mineZ,
                    rammed: false,
                };
            }

            if (bodyCheck.blocked) {
                // If blocked by a ship, this is a ramming event
                if (bodyCheck.blockingShip && !bodyCheck.blockingShip.isSunk()) {
                    return {
                        path: traversed,
                        finalX: traversed.length > 0 ? traversed[traversed.length - 1].x : startX,
                        finalZ: traversed.length > 0 ? traversed[traversed.length - 1].z : startZ,
                        hitMine: false,
                        rammed: true,
                        rammedShip: bodyCheck.blockingShip,
                        collisionCell: cell,
                    };
                }
                // Blocked by Sunk cell or other impassable — just stop
                break;
            }

            traversed.push(cell);
        }

        if (traversed.length === 0) return emptyResult;

        const last = traversed[traversed.length - 1];
        return {
            path: traversed,
            finalX: last.x,
            finalZ: last.z,
            hitMine: false,
            rammed: false,
        };
    }

    /**
     * Checks the full footprint of a ship (all segments) at a hypothetical head position.
     * Returns whether any segment is out of bounds, hits a mine, or is blocked.
     */
    private checkShipFootprint(
        board: Board,
        ship: Ship,
        headX: number,
        headZ: number,
        orientation: Orientation
    ): {
        outOfBounds: boolean;
        hitMine: boolean;
        mineX?: number;
        mineZ?: number;
        blocked: boolean;
        blockingShip?: Ship;
    } {
        for (let i = 0; i < ship.size; i++) {
            const { x: sx, z: sz } = this.getSegmentPosition(headX, headZ, orientation, i);

            // Bounds check
            if (board.isOutOfBounds(sx, sz)) {
                return { outOfBounds: true, hitMine: false, blocked: false };
            }

            const index = getIndex(sx, sz, board.width);
            const state = board.gridState[index];

            // Mine check — ship moves into the mine cell
            if (state === CellState.Mine) {
                const mineShip = board.getShipAt(sx, sz);
                if (mineShip && mineShip !== ship && mineShip.specialType === 'mine') {
                    return {
                        outOfBounds: false,
                        hitMine: true,
                        mineX: sx,
                        mineZ: sz,
                        blocked: false,
                    };
                }
            }

            // Collision check (ships, sunk cells)
            const blockCheck = this.isCellBlocked(board, sx, sz, ship);
            if (blockCheck.blocked) {
                return {
                    outOfBounds: false,
                    hitMine: false,
                    blocked: true,
                    blockingShip: blockCheck.blockingShip,
                };
            }
        }

        return { outOfBounds: false, hitMine: false, blocked: false };
    }

    /**
     * Computes the world position of a ship segment given head position and orientation.
     */
    private getSegmentPosition(
        headX: number, headZ: number,
        orientation: Orientation, segmentIndex: number
    ): { x: number; z: number } {
        switch (orientation) {
            case Orientation.Horizontal:
                return { x: headX + segmentIndex, z: headZ };
            case Orientation.Vertical:
                return { x: headX, z: headZ + segmentIndex };
            case Orientation.Left:
                return { x: headX - segmentIndex, z: headZ };
            case Orientation.Up:
                return { x: headX, z: headZ - segmentIndex };
        }
    }
}
