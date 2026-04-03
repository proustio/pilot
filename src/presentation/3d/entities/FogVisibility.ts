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

    // O(1) Cache for visibility
    private visibilityCache: Uint8Array;

    constructor(rogueMode: boolean) {
        this.rogueMode = rogueMode;
        const totalCells = Config.board.width * Config.board.height;
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
        const boardWidth = Config.board.width;
        const index = z * boardWidth + x;
        this.temporarilyRevealedCells.set(index, duration);
        this.rebuildCache();
    }

    public revealCellPermanently(x: number, z: number): void {
        const boardWidth = Config.board.width;
        const index = z * boardWidth + x;
        this.permanentlyRevealedCells.add(index);
        this.rebuildCache();
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
        const boardWidth = Config.board.width;
        const totalCells = boardWidth * Config.board.height;

        // 1. Permanent and Temporary reveals
        for (const index of this.permanentlyRevealedCells) {
            if (index >= 0 && index < totalCells) this.visibilityCache[index] = 1;
        }
        for (const [index] of this.temporarilyRevealedCells.entries()) {
            if (index >= 0 && index < totalCells) this.visibilityCache[index] = 1;
        }

        // 2. Setup Phase reveal (player quadrant)
        if (this.isSetupPhase) {
            for (let z = 0; z < 7; z++) {
                for (let x = 0; x < 7; x++) {
                    const idx = z * boardWidth + x;
                    if (idx < totalCells) this.visibilityCache[idx] = 1;
                }
            }
        }

        if (!this.lastShipsOnBoard) return;

        // 3. Radius-based fog around player ships
        for (const ship of this.lastShipsOnBoard) {
            if (ship.isEnemy || ship.isSunk()) continue;
            const coords = ship.getOccupiedCoordinates();
            for (const c of coords) {
                const startX = Math.max(0, c.x - ship.visionRadius);
                const endX = Math.min(boardWidth - 1, c.x + ship.visionRadius);
                const startZ = Math.max(0, c.z - ship.visionRadius);
                const endZ = Math.min(Config.board.height - 1, c.z + ship.visionRadius);

                for (let z = startZ; z <= endZ; z++) {
                    for (let x = startX; x <= endX; x++) {
                        const dx = Math.abs(c.x - x);
                        const dz = Math.abs(c.z - z);
                        if (Math.max(dx, dz) <= ship.visionRadius) {
                            this.visibilityCache[z * boardWidth + x] = 1;
                        }
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
                    if (c.x >= 0 && c.x < boardWidth && c.z >= 0 && c.z < Config.board.height) {
                        this.visibilityCache[c.z * boardWidth + c.x] = 1;
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

        if (!this.rogueMode || !this.isInitialized) {
            return 0.85; // Default to fogged if not rogue mode or not initialized (beyond temp/perm reveals)
        }

        if (fogIdx >= 0 && fogIdx < this.visibilityCache.length) {
            return this.visibilityCache[fogIdx] === 1 ? 0.0 : 0.85;
        }

        return 0.85;
    }

    public isCellRevealed(x: number, z: number, fogMeshOpacityCheck?: () => boolean): boolean {
        const boardWidth = Config.board.width;
        const fogIdx = z * boardWidth + x;

        // Permanent and temporary reveals apply to all modes
        if (this.permanentlyRevealedCells.has(fogIdx)) return true;
        if (this.temporarilyRevealedCells.has(fogIdx)) return true;

        // Setup phase reveal applies to all modes
        if (this.isSetupPhase && x < 7 && z < 7) return true;

        // In Rogue mode, if not yet initialized, nothing is revealed
        if (this.rogueMode && !this.isInitialized) return false;

        if (this.rogueMode) {
            if (fogIdx >= 0 && fogIdx < this.visibilityCache.length) {
                return this.visibilityCache[fogIdx] === 1;
            }
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
