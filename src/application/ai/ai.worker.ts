import { CellState } from '../../domain/board/Board';
import { Orientation } from '../../domain/fleet/Ship';
import { MatchMode } from '../../domain/match/Match';

interface ShipData {
    size: number;
    isEnemy: boolean;
}

self.onmessage = (e: MessageEvent) => {
    const { width, height, gridState, mode, aliveShips, ITERATIONS } = e.data;

    const heatMap = new Uint32Array(width * height);

    for (let i = 0; i < ITERATIONS; i++) {
        const shipToPlace: ShipData = aliveShips[Math.floor(Math.random() * aliveShips.length)];

        const x = Math.floor(Math.random() * width);
        const z = Math.floor(Math.random() * height);
        const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;

        if (canFitShipExperimentally(width, height, gridState, shipToPlace, x, z, orient, mode)) {
            for (let s = 0; s < shipToPlace.size; s++) {
                const cx = orient === Orientation.Horizontal ? x + s : x;
                const cz = orient === Orientation.Vertical ? z + s : z;
                const idx = cz * width + cx;
                heatMap[idx]++;
            }
        }
    }

    self.postMessage({ heatMap });
};

function canFitShipExperimentally(
    width: number,
    height: number,
    gridState: Uint8Array,
    ship: ShipData,
    headX: number,
    headZ: number,
    orientation: Orientation,
    mode: MatchMode
): boolean {
    const shipTailX = orientation === Orientation.Horizontal ? headX + ship.size - 1 : headX;
    const shipTailZ = orientation === Orientation.Vertical ? headZ + ship.size - 1 : headZ;

    if (shipTailX >= width || shipTailZ >= height) {
        return false;
    }

    if (mode === MatchMode.Rogue) {
        if (ship.isEnemy) {
            if (headX < 13 || headZ < 13) return false;
        } else {
            if (shipTailX >= 7 || shipTailZ >= 7) return false;
        }
    }

    for (let i = 0; i < ship.size; i++) {
        const cx = orientation === Orientation.Horizontal ? headX + i : headX;
        const cz = orientation === Orientation.Vertical ? headZ + i : headZ;
        const idx = cz * width + cx;
        const state = gridState[idx];

        if (state === CellState.Miss || state === CellState.Sunk) {
            return false;
        }

        if (mode === MatchMode.Russian) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const nx = cx + dx;
                    const nz = cz + dz;
                    if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
                    const nIdx = nz * width + nx;
                    if (gridState[nIdx] === CellState.Sunk) {
                        return false;
                    }
                }
            }
        }
    }

    return true;
}
