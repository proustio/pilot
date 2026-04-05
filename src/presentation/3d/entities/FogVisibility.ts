import { Config } from '../../../infrastructure/config/Config';
import { Ship } from '../../../domain/fleet/Ship';

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

    private width: number;
    private height: number;

    constructor(rogueMode: boolean) {
        this.rogueMode = rogueMode;
        this.width = rogueMode ? Config.board.rogueWidth : Config.board.width;
        this.height = rogueMode ? Config.board.rogueHeight : Config.board.height;
        const totalCells = this.width * this.height;
        this.visibilityCache = new Uint8Array(totalCells);
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
        // Remove strictly referential equality check to ensure cache rebuilds on property updates
        this.lastShipsOnBoard = ships;
        this.rebuildCache();
    }

    public revealCellTemporarily(x: number, z: number, duration: number = 2): void {
        const index = z * this.width + x;
        if (index >= 0 && index < this.visibilityCache.length) {
            this.temporarilyRevealedCells.set(index, duration);
            this.rebuildCache();
        }
    }

    public revealCellPermanently(x: number, z: number): void {
        const index = z * this.width + x;
        if (index >= 0 && index < this.visibilityCache.length) {
            this.permanentlyRevealedCells.add(index);
            this.rebuildCache();
        }
    }

    public onTurnChange(): void {
        for (const [index, duration] of this.temporarilyRevealedCells.entries()) {
            if (duration <= 1) {
                this.temporarilyRevealedCells.delete(index);
            } else {
                this.temporarilyRevealedCells.set(index, duration - 1);
            }
        }
        this.rebuildCache();
    }

    /**
     * Rebuilds the O(1) visibility cache. This should be called whenever
     * ships move, are destroyed, or temporary/permanent reveals change.
     */
    public rebuildCache(): void {
        if (!this.rogueMode) return;

        this.visibilityCache.fill(0); // 0 = fogged, 1 = revealed
        const totalCells = this.width * this.height;

        // 1. Permanent and Temporary reveals
        for (const index of this.permanentlyRevealedCells) {
            if (index >= 0 && index < totalCells) this.visibilityCache[index] = 1;
        }
        for (const [index] of this.temporarilyRevealedCells.entries()) {
            if (index >= 0 && index < totalCells) this.visibilityCache[index] = 1;
        }

        // 2. Setup Phase reveal (player quadrant: (0-6, 0-6))
        if (this.isSetupPhase) {
            for (let z = 0; z < 7; z++) {
                const zOff = z * this.width;
                for (let x = 0; x < 7; x++) {
                    const idx = zOff + x;
                    if (idx < totalCells) this.visibilityCache[idx] = 1;
                }
            }
        }

        if (!this.lastShipsOnBoard) return;

        // 3. Radius-based fog around player ships
        for (const ship of this.lastShipsOnBoard) {
            if (ship.isEnemy || ship.isSunk()) continue;
            const coords = ship.getOccupiedCoordinates();
            const radius = ship.visionRadius;
            for (const c of coords) {
                const startX = Math.max(0, c.x - radius);
                const endX = Math.min(this.width - 1, c.x + radius);
                const startZ = Math.max(0, c.z - radius);
                const endZ = Math.min(this.height - 1, c.z + radius);

                for (let z = startZ; z <= endZ; z++) {
                    const zOff = z * this.width;
                    for (let x = startX; x <= endX; x++) {
                        // Math.max(dx, dz) <= radius is already covered by loop bounds
                        this.visibilityCache[zOff + x] = 1;
                    }
                }
            }
        }

        // 4. Reveal fog on any sunk ships or specific hit segments
        for (const ship of this.lastShipsOnBoard) {
            const coords = ship.getOccupiedCoordinates();
            for (let i = 0; i < coords.length; i++) {
                if (ship.isSunk() || ship.segments[i] === false) {
                    const c = coords[i];
                    if (c.x >= 0 && c.x < this.width && c.z >= 0 && c.z < this.height) {
                        this.visibilityCache[c.z * this.width + c.x] = 1;
                    }
                }
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
        fogIdx: number
    ): number {
        // Permanent and temporary reveals apply to all modes
        if (this.permanentlyRevealedCells.has(fogIdx)) return 0.0;
        if (this.temporarilyRevealedCells.has(fogIdx)) return 0.0;

        // Setup phase reveal applies to all modes
        if (this.isSetupPhase && x < 7 && z < 7) {
            return 0.0;
        }

        if (!this.rogueMode) {
            // In classic mode, everything is revealed by default
            return 0.0;
        }

        if (!this.isInitialized) {
            return 0.85; // Default to fogged in rogue mode if not initialized
        }

        if (fogIdx >= 0 && fogIdx < this.visibilityCache.length) {
            return this.visibilityCache[fogIdx] === 1 ? 0.0 : 0.85;
        }

        return 0.85;
    }

    public isCellRevealed(x: number, z: number): boolean {
        const fogIdx = z * this.width + x;

        // Permanent and temporary reveals apply to all modes
        if (this.permanentlyRevealedCells.has(fogIdx)) return true;
        if (this.temporarilyRevealedCells.has(fogIdx)) return true;

        // Setup phase reveal applies to all modes
        if (this.isSetupPhase && x < 7 && z < 7) return true;

        if (!this.rogueMode) {
            // In Classic mode, visibility is always true
            return true;
        }

        if (!this.isInitialized) return false;

        if (fogIdx >= 0 && fogIdx < this.visibilityCache.length) {
            return this.visibilityCache[fogIdx] === 1;
        }

        return false;
    }

    public reset(): void {
        this.temporarilyRevealedCells.clear();
        this.permanentlyRevealedCells.clear();
        this.isInitialized = false;
    }
}
