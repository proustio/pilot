import { Match } from '../../domain/match/Match';
import { Config } from '../config/Config';

export class Storage {
    /**
     * Serializes the current Match state and saves it to localStorage.
     * @param slotId 1, 2, or 3
     * @param match Current Match instance
     */
    public static saveGame(slotId: number, match: Match): boolean {
        if (slotId < 1 || slotId > Config.storage.maxSlots) return false;
        
        const key = `${Config.storage.prefix}${slotId}`;
        
        try {
            // Very naive serialization. 
            // In a production app, we would write a custom serializer for Ship and Board classes,
            // or just use JSON.stringify and then reconstruct the class prototypes on load.
            const serialized = JSON.stringify(match);
            localStorage.setItem(key, serialized);
            return true;
        } catch (e) {
            console.error('Failed to save game', e);
            return false;
        }
    }

    /**
     * Loads a Match state from localStorage.
     * @param slotId 1, 2, or 3
     */
    public static loadGame(slotId: number): Match | null {
        const key = `${Config.storage.prefix}${slotId}`;
        const data = localStorage.getItem(key);
        
        if (!data) return null;

        try {
            const parsed = JSON.parse(data);
            
            // Reconstruct Match class
            const match = new Match(parsed.mode);
            
            // In a fully working version, we would need to map the parsed raw objects
            // back into instantiating actual `Ship` and `Board` objects so they have their methods.
            // For now, doing a dirty assign, note that class methods will be missing if not instantiated properly.
            Object.assign(match.playerBoard, parsed.playerBoard);
            Object.assign(match.enemyBoard, parsed.enemyBoard);
            
            return match;
        } catch (e) {
            console.error('Failed to load game', e);
            return null;
        }
    }

    public static hasSave(slotId: number): boolean {
        const key = `${Config.storage.prefix}${slotId}`;
        return localStorage.getItem(key) !== null;
    }

    public static clearSave(slotId: number): void {
        const key = `${Config.storage.prefix}${slotId}`;
        localStorage.removeItem(key);
    }
}
