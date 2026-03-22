export enum Orientation {
    Horizontal = 'horizontal',
    Vertical = 'vertical',
}

export class Ship {
    public id: string;
    public size: number;
    public orientation: Orientation;
    public headX: number = -1; // Top-leftmost coordinate (x) 
    public headZ: number = -1; // Top-leftmost coordinate (z)
    
    // Array of booleans representing the health of each segment (true = healthy, false = hit)
    public segments: boolean[];
    
    // Will be populated once placed on a board
    public isPlaced: boolean = false;
    public isEnemy?: boolean;
    
    // Rogue Mode properties
    public movesRemaining: number = 0;
    public hasActedThisTurn: boolean = false;
    public readonly maxMoves: number;
    public visionRadius: number;

    // Resource tracking (carried by each ship for simplicity, but we can treat as global later)
    public static resources = {
        airStrikes: 1,
        sonars: 2,
        mines: 5
    };

    constructor(id: string, size: number) {
        this.id = id;
        this.size = size;
        this.orientation = Orientation.Horizontal; // default
        this.segments = new Array(size).fill(true);
        this.maxMoves = 5 - this.size;
        this.visionRadius = this.size * 2;
    }

    /**
     * Determines the absolute coordinates this ship holds based on its head position and orientation.
     */
    public getOccupiedCoordinates(): { x: number, z: number }[] {
        if (!this.isPlaced) return [];
        
        const coords = [];
        for (let i = 0; i < this.size; i++) {
            if (this.orientation === Orientation.Horizontal) {
                // Horizontal expands to the right (+x)
                coords.push({ x: this.headX + i, z: this.headZ });
            } else {
                // Vertical expands downward (+z)
                coords.push({ x: this.headX, z: this.headZ + i });
            }
        }
        return coords;
    }

    public occupies(x: number, z: number): boolean {
        const coords = this.getOccupiedCoordinates();
        return coords.some(c => c.x === x && c.z === z);
    }

    /**
     * Hits a specific local segment (index 0 to size-1) on the ship.
     * @param index Local index of the segment
     * @returns True if it was a new hit, false if it was already hit.
     */
    public hitSegment(index: number): boolean {
        if (index < 0 || index >= this.size) return false;
        
        if (this.segments[index] === true) {
            this.segments[index] = false;
            return true;
        }
        return false;
    }

    /**
     * Checks if all segments are hit.
     */
    public isSunk(): boolean {
        return this.segments.every(segmentHealth => !segmentHealth);
    }
    
    /**
     * Set the ship's coordinate and orientation
     */
    public placeCoordinate(x: number, z: number, orientation: Orientation) {
        this.headX = x;
        this.headZ = z;
        this.orientation = orientation;
        this.isPlaced = true;
    }

    /**
     * Resets action flags for the start of a turn in Rogue Mode
     */
    public resetTurnAction() {
        this.hasActedThisTurn = false;
        this.movesRemaining = this.maxMoves;
    }
}
