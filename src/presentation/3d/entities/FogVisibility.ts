import { Config } from '../../../infrastructure/config/Config';
import { Ship, Orientation } from '../../../domain/fleet/Ship';

/**
 * Tracks cell reveal state (temporary, permanent) and vision radius queries
 * for the fog-of-war system. Extracted from FogManager to separate visibility
 * logic from fog mesh lifecycle management.
 */
export class FogVisibility {
    private temporarilyRevealedCells: Map<number, number> = new Map();
    private permanentlyRevealedCells: Set<number> = new Set();
    private lastShipsOnBoard: Ship[] | null = null;
    private isInitialized: boolean = false;
    private isSetupPhase: boolean = false;
    public rogueMode: boolean;

    constructor(rogueMode: boolean) {
        this.rogueMode = rogueMode;
    }

    public setInitialized(value: boolean): void {
        this.isInitialized = value;
    }

    public getIsInitialized(): boolean {
        return this.isInitialized;
    }

    public setSetupPhase(isSetup: boolean): void {
        this.isSetupPhase = isSetup;
    }

    public getIsSetupPhase(): boolean {
        return this.isSetupPhase;
    }

    public setLastShipsOnBoard(ships: Ship[]): void {
        this.lastShipsOnBoard = ships;
    }

    public revealCellTemporarily(x: number, z: number, duration: number = 2): void {
        const boardWidth = Config.board.width;
        const index = z * boardWidth + x;
        this.temporarilyRevealedCells.set(index, duration);
    }

    public revealCellPermanently(x: number, z: number): void {
        const boardWidth = Config.board.width;
        const index = z * boardWidth + x;
        this.permanentlyRevealedCells.add(index);
    }

    public onTurnChange(): void {
        for (const [index, duration] of this.temporarilyRevealedCells.entries()) {
            if (duration <= 1) {
                this.temporarilyRevealedCells.delete(index);
            } else {
                this.temporarilyRevealedCells.set(index, duration - 1);
            }
        }
    }

    /**
     * Returns the target opacity for a cell during fog computation.
     * 0.0 = fully revealed, 0.85 = fully fogged.
     */
    public computeCellOpacity(
        x: number,
        z: number,
        fogIdx: number,
        shipCells: { x: number; z: number; ship: Ship; segmentIndex: number }[]
    ): number {
        let targetOpacity = 0.85;

        // Rule 1: Radius-based fog around ships
        let minDist = Infinity;
        // Optimization: Standard `for` loop is faster than `for...of` on hot paths
        for (let i = 0; i < shipCells.length; i++) {
            const cell = shipCells[i];
            if (cell.ship.isEnemy) continue;
            const dx = Math.abs(cell.x - x);
            const dz = Math.abs(cell.z - z);
            const dist = Math.max(dx, dz);
            const normalizedDist = dist / cell.ship.visionRadius;
            if (normalizedDist < minDist) {
                minDist = normalizedDist;
            }
        }
        if (minDist <= 1.0) {
            targetOpacity = 0.0;
        }

        // Rule 2: During setup, reveal player quadrant (0-6, 0-6)
        if (this.isSetupPhase && x < 7 && z < 7) {
            targetOpacity = 0.0;
        }

        // Rule 3: Temporary reveals from attacks
        if (this.temporarilyRevealedCells.has(fogIdx)) {
            targetOpacity = 0.0;
        }

        // Rule 4: Permanent reveals (e.g. sunk ships)
        if (this.permanentlyRevealedCells.has(fogIdx)) {
            targetOpacity = 0.0;
        }

        // Rule 5: Reveal fog on any sunk ships or hit segments
        for (const cell of shipCells) {
            if (cell.x === x && cell.z === z) {
                const isSunk = cell.ship.isSunk();
                const isHit = cell.ship.segments[cell.segmentIndex] === false;
                if (isSunk || isHit) {
                    targetOpacity = 0.0;
                    break;
                }
            }
        }

        return targetOpacity;
    }

    public isCellRevealed(x: number, z: number, fogMeshOpacityCheck?: () => boolean): boolean {
        // In Rogue mode, if not yet initialized, nothing is revealed
        if (this.rogueMode && !this.isInitialized) return false;

        const boardWidth = Config.board.width;
        const fogIdx = z * boardWidth + x;

        // Permanent and temporary (ping) reveals are always true
        if (this.permanentlyRevealedCells.has(fogIdx)) return true;
        if (this.temporarilyRevealedCells.has(fogIdx)) return true;

        if (this.rogueMode) {
            // Check if within any player ship's vision radius
            if (this.lastShipsOnBoard) {
                for (const ship of this.lastShipsOnBoard) {
                    if (ship.isEnemy || ship.isSunk()) continue;
                    for (let i = 0; i < ship.size; i++) {
                        let cx = ship.headX;
                        let cz = ship.headZ;
                        if (ship.orientation === Orientation.Horizontal) cx += i;
                        else if (ship.orientation === Orientation.Vertical) cz += i;
                        else if (ship.orientation === Orientation.Left) cx -= i;
                        else if (ship.orientation === Orientation.Up) cz -= i;

                        const dx = Math.abs(cx - x);
                        const dz = Math.abs(cz - z);
                        if (Math.max(dx, dz) <= ship.visionRadius) return true;
                    }
                }
            }

            // Check if specific ship segment is hit or sunk at this location
            if (this.lastShipsOnBoard) {
                for (const ship of this.lastShipsOnBoard) {
                    if (!ship.isSunk() && !ship.segments.includes(false)) continue;

                    for (let i = 0; i < ship.size; i++) {
                        let cx = ship.headX;
                        let cz = ship.headZ;
                        if (ship.orientation === Orientation.Horizontal) cx += i;
                        else if (ship.orientation === Orientation.Vertical) cz += i;
                        else if (ship.orientation === Orientation.Left) cx -= i;
                        else if (ship.orientation === Orientation.Up) cz -= i;

                        if (cx === x && cz === z) {
                            if (ship.isSunk() || ship.segments[i] === false) return true;
                        }
                    }
                }
            }

            // Setup phase reveal
            if (this.isSetupPhase && x < 7 && z < 7) return true;

            // In Rogue mode, no per-cell fog meshes exist — cell is fogged by default
            return false;
        }

        // Classic/Fallback: delegate to fog mesh opacity check
        if (fogMeshOpacityCheck) {
            return fogMeshOpacityCheck();
        }

        return false;
    }

    public reset(): void {
        this.temporarilyRevealedCells.clear();
        this.permanentlyRevealedCells.clear();
        this.isInitialized = false;
    }
}
