import { Board, CellState } from '../../domain/board/Board';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { Match, MatchMode } from '../../domain/match/Match';
import { getIndex } from '../../domain/board/BoardUtils';
import type { AIDifficulty } from './AIEngine';

/**
 * Handles attack target selection for AI — easy (random), normal (hunt/target),
 * and hard (Monte Carlo heatmap) strategies.
 */
export class AITargeting {

    /**
     * Computes the next coordinate to attack based on difficulty.
     */
    private worker: Worker | null = null;
    private workerCallbacks = new Map<number, (result: any) => void>();
    private workerMessageId = 0;

    constructor() {
        this.initWorker();
    }

    public initWorker() {
        if (typeof Worker !== 'undefined' && !this.worker) {
            this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = (e: MessageEvent) => {
                const { id, heatMap } = e.data;
                const callback = this.workerCallbacks.get(id);
                if (callback) {
                    callback(heatMap);
                    this.workerCallbacks.delete(id);
                }
            };
            this.worker.onerror = (e) => {
                console.error("AI Worker Error:", e);
                // On error, we'll just clear pending callbacks so they don't hang
                for (const callback of this.workerCallbacks.values()) {
                    callback(null); // signal failure
                }
                this.workerCallbacks.clear();
            };
        }
    }

    public terminateWorker() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.workerCallbacks.clear();
    }

    public async computeNextMove(
        playerBoard: Board,
        match: Match,
        difficulty: AIDifficulty,
        huntStack: { x: number; z: number }[]
    ): Promise<{ x: number; z: number }> {
        switch (difficulty) {
            case 'easy':
                return this.computeEasyMove(playerBoard);
            case 'normal':
                return this.computeNormalMove(playerBoard, huntStack);
            case 'hard':
                return await this.computeHardMove(playerBoard, match, huntStack);
            default:
                return this.computeEasyMove(playerBoard);
        }
    }

    private computeEasyMove(board: Board): { x: number; z: number } {
        let x = 0;
        let z = 0;
        let valid = false;
        let attempts = 0;
        const maxAttempts = board.width * board.height * 2;

        while (!valid && attempts < maxAttempts) {
            attempts++;
            x = Math.floor(Math.random() * board.width);
            z = Math.floor(Math.random() * board.height);

            const idx = getIndex(x, z, board.width);
            const state = board.gridState[idx];

            if (state === CellState.Empty || state === CellState.Ship) {
                const ship = board.ships.find(s => s.occupies(x, z));
                if (ship && ship.isEnemy) {
                    continue;
                }
                valid = true;
            }
        }

        if (!valid) {
            for (let i = 0; i < board.gridState.length; i++) {
                const state = board.gridState[i];
                if (state === CellState.Empty || state === CellState.Ship) {
                    const tx = i % board.width;
                    const tz = Math.floor(i / board.width);
                    const ship = board.ships.find(s => s.occupies(tx, tz));
                    if (!(ship && ship.isEnemy)) {
                        return { x: tx, z: tz };
                    }
                }
            }
        }

        return { x, z };
    }

    private computeNormalMove(
        board: Board,
        huntStack: { x: number; z: number }[]
    ): { x: number; z: number } {
        while (huntStack.length > 0) {
            const target = huntStack.pop()!;

            const ship = board.ships.find(s => s.occupies(target.x, target.z));
            if (ship && ship.isEnemy) {
                continue;
            }

            const idx = getIndex(target.x, target.z, board.width);
            const state = board.gridState[idx];

            if (state === CellState.Empty || state === CellState.Ship) {
                return target;
            }
        }

        return this.computeEasyMove(board);
    }

    private computeHardMove(
        board: Board,
        match: Match,
        huntStack: { x: number; z: number }[]
    ): Promise<{ x: number; z: number }> {
        return new Promise((resolve) => {
            if (huntStack.length > 0) {
                return resolve(this.computeNormalMove(board, huntStack));
            }

            const aliveShips = board.ships.filter((s: Ship) => !s.isSunk());
            if (aliveShips.length === 0) {
                return resolve(this.computeEasyMove(board));
            }

            if (this.worker) {
                const messageId = this.workerMessageId++;
                this.workerCallbacks.set(messageId, (heatMap: Uint32Array | null) => {
                    if (!heatMap) {
                        resolve(this.computeEasyMove(board));
                        return;
                    }

                    const width = board.width;
                    const height = board.height;

                    let maxHeat = -1;
                    let bestTarget = { x: -1, z: -1 };

                    for (let z = 0; z < height; z++) {
                        for (let x = 0; x < width; x++) {
                            const idx = getIndex(x, z, width);
                            const state = board.gridState[idx];

                            if (state === CellState.Empty || state === CellState.Ship) {
                                const ship = board.ships.find(s => s.occupies(x, z));
                                if (ship && ship.isEnemy) continue;

                                if (heatMap[idx] > maxHeat) {
                                    maxHeat = heatMap[idx];
                                    bestTarget = { x, z };
                                }
                            }
                        }
                    }

                    if (bestTarget.x === -1) {
                        resolve(this.computeEasyMove(board));
                    } else {
                        resolve(bestTarget);
                    }
                });

                const shipData = aliveShips.map(s => ({ size: s.size, isEnemy: s.isEnemy }));

                this.worker.postMessage({
                    id: messageId,
                    width: board.width,
                    height: board.height,
                    gridState: board.gridState,
                    mode: match.mode,
                    aliveShips: shipData,
                    ITERATIONS: 1000
                });
            } else {
                // Fallback for environments without Web Worker support (e.g., Node/JSDOM tests)
                const width = board.width;
                const height = board.height;
                const heatMap = new Uint32Array(width * height);
                const ITERATIONS = 1000;

                for (let i = 0; i < ITERATIONS; i++) {
                    const shipToPlace = aliveShips[Math.floor(Math.random() * aliveShips.length)];
                    const x = Math.floor(Math.random() * width);
                    const z = Math.floor(Math.random() * height);
                    const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;

                    if (this.canFitShipExperimentally(board, shipToPlace, x, z, orient, match.mode)) {
                        for (let s = 0; s < shipToPlace.size; s++) {
                            const cx = orient === Orientation.Horizontal ? x + s : x;
                            const cz = orient === Orientation.Vertical ? z + s : z;
                            const idx = getIndex(cx, cz, width);
                            heatMap[idx]++;
                        }
                    }
                }

                let maxHeat = -1;
                let bestTarget = { x: -1, z: -1 };

                for (let z = 0; z < height; z++) {
                    for (let x = 0; x < width; x++) {
                        const idx = getIndex(x, z, width);
                        const state = board.gridState[idx];

                        if (state === CellState.Empty || state === CellState.Ship) {
                            const ship = board.ships.find(s => s.occupies(x, z));
                            if (ship && ship.isEnemy) continue;

                            if (heatMap[idx] > maxHeat) {
                                maxHeat = heatMap[idx];
                                bestTarget = { x, z };
                            }
                        }
                    }
                }

                if (bestTarget.x === -1) {
                    resolve(this.computeEasyMove(board));
                } else {
                    resolve(bestTarget);
                }
            }
        });
    }

    /**
     * Checks if a ship can theoretically be placed at (x,z) without contradicting
     * the AI's known knowledge of the board (Misses, Sunk ships).
     */
    public canFitShipExperimentally(
        board: Board,
        ship: Ship,
        headX: number,
        headZ: number,
        orientation: Orientation,
        mode: MatchMode
    ): boolean {
        if (!board.canPlaceShip(ship.size, headX, headZ, orientation)) {
            return false;
        }

        if (mode === MatchMode.Rogue) {
            const shipTailX = orientation === Orientation.Horizontal ? headX + ship.size - 1 : headX;
            const shipTailZ = orientation === Orientation.Vertical ? headZ + ship.size - 1 : headZ;

            if (ship.isEnemy === true) {
                if (headX < 13 || headZ < 13) return false;
            } else {
                if (shipTailX >= 7 || shipTailZ >= 7) return false;
            }
        }

        for (let i = 0; i < ship.size; i++) {
            const cx = orientation === Orientation.Horizontal ? headX + i : headX;
            const cz = orientation === Orientation.Vertical ? headZ + i : headZ;
            const idx = getIndex(cx, cz, board.width);
            const state = board.gridState[idx];

            if (state === CellState.Miss || state === CellState.Sunk) {
                return false;
            }

            if (mode === MatchMode.Russian) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const nx = cx + dx;
                        const nz = cz + dz;
                        if (board.isOutOfBounds(nx, nz)) continue;
                        const nIdx = getIndex(nx, nz, board.width);
                        if (board.gridState[nIdx] === CellState.Sunk) {
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    }
}
