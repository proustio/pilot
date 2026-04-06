import { Orientation } from '../../../domain/fleet/Ship';

export class InteractionStateTracker {
    public lastInteractionState: {
        x: number,
        z: number,
        isPlayerSide: boolean,
        gameState: string,
        orientation: Orientation | null,
        shipId: string | null
    } | null = null;

    public ghostCheckCache: {
        time: number;
        x: number;
        z: number;
        orientation: Orientation | null;
        shipId: string | null;
        isValid: boolean;
    } = { time: 0, x: -1, z: -1, orientation: null, shipId: null, isValid: false };

    public hasStateChanged(
        currentX: number,
        currentZ: number,
        isPlayerSide: boolean,
        gameState: string,
        orientation: Orientation | null,
        shipId: string | null
    ): boolean {
        const stateHasChanged = !this.lastInteractionState ||
            this.lastInteractionState.x !== currentX ||
            this.lastInteractionState.z !== currentZ ||
            this.lastInteractionState.isPlayerSide !== isPlayerSide ||
            this.lastInteractionState.gameState !== gameState ||
            this.lastInteractionState.orientation !== orientation ||
            this.lastInteractionState.shipId !== shipId;

        if (stateHasChanged) {
            this.lastInteractionState = { 
                x: currentX, 
                z: currentZ, 
                isPlayerSide, 
                gameState, 
                orientation, 
                shipId 
            };
        }

        return stateHasChanged;
    }

    public isGhostCacheValid(
        now: number,
        x: number,
        z: number,
        orientation: Orientation | null,
        shipId: string | null
    ): boolean {
        const cache = this.ghostCheckCache;
        const isSameState = cache.x === x && cache.z === z && cache.orientation === orientation && cache.shipId === shipId;
        return isSameState && (now - cache.time < 300);
    }

    public updateGhostCache(
        now: number,
        x: number,
        z: number,
        orientation: Orientation | null,
        shipId: string | null,
        isValid: boolean
    ): void {
        this.ghostCheckCache.time = now;
        this.ghostCheckCache.x = x;
        this.ghostCheckCache.z = z;
        this.ghostCheckCache.orientation = orientation;
        this.ghostCheckCache.shipId = shipId;
        this.ghostCheckCache.isValid = isValid;
    }
}
