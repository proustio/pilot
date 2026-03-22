import { Board } from '../board/Board';
import { Ship, Orientation } from '../fleet/Ship';
import { getIndex } from '../board/BoardUtils';

export enum MatchMode {
    Classic = 'classic',
    Russian = 'russian',
    Rogue = 'rogue'
}

export class Match {
    public playerBoard: Board;
    public enemyBoard: Board;
    public mode: MatchMode;

    constructor(mode: MatchMode = MatchMode.Classic, width: number = 10, height: number = 10) {
        this.mode = mode;
        this.playerBoard = new Board(width, height);
        this.enemyBoard = new Board(width, height);
    }

    /**
     * Initializes the fleets based on the selected mode's ruleset.
     * Classic US: 1x5, 1x4, 2x3, 1x2 (Total 5 ships, 17 hits)
     * Russian: 1x4, 2x3, 3x2, 4x1 (Total 10 ships, 20 hits)
     */
    public getRequiredFleet(): Ship[] {
        if (this.mode === MatchMode.Classic || this.mode === MatchMode.Rogue) {
            return [
                new Ship('carrier', 5),
                new Ship('battleship', 4),
                new Ship('destroyer', 3),
                new Ship('submarine', 3),
                new Ship('patrol', 2)
            ];
        } else {
            // Russian ruleset
            return [
                new Ship('battleship-1', 4),
                new Ship('cruiser-1', 3), new Ship('cruiser-2', 3),
                new Ship('destroyer-1', 2), new Ship('destroyer-2', 2), new Ship('destroyer-3', 2),
                new Ship('submarine-1', 1), new Ship('submarine-2', 1), new Ship('submarine-3', 1), new Ship('submarine-4', 1)
            ];
        }
    }

    /**
     * More strict placement validation depending on mode.
     * Russian mode requires absolutely no touching (even diagonally).
     */
    public validatePlacement(board: Board, shipToPlace: Ship, headX: number, headZ: number, orientation: Orientation): boolean {
        // First check base overlapping/boundaries
        if (!board.canPlaceShip(shipToPlace.size, headX, headZ, orientation)) {
            return false;
        }

        // Apply Russian non-touching constraints
        if (this.mode === MatchMode.Russian) {
            for (let i = 0; i < shipToPlace.size; i++) {
                const cx = orientation === Orientation.Horizontal ? headX + i : headX;
                const cz = orientation === Orientation.Vertical ? headZ + i : headZ;

                // Check all 8 surrounding neighbors for any existing ship
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const nx = cx + dx;
                        const nz = cz + dz;
                        // Skip out of bounds
                        if (board.isOutOfBounds(nx, nz)) continue;
                        // Determine index
                        const idx = getIndex(nx, nz, board.width);
                        // In Russian version, even diagonal touching is forbidden
                        // Since placing updates `CellState.Ship`, we just check for that.
                        if (board.gridState[idx] === 2 /* CellState.Ship */) {
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    }

    public checkGameEnd(): 'player_wins' | 'enemy_wins' | 'ongoing' {
        if (this.enemyBoard.allShipsSunk()) return 'player_wins';
        if (this.playerBoard.allShipsSunk()) return 'enemy_wins';
        return 'ongoing';
    }
}
