import { describe, it, expect, vi } from 'vitest';
import { eventBus, GameEventType } from '../GameEventBus';

describe('GameEventBus', () => {
    it('should emit and receive events with payloads', () => {
        const callback = vi.fn();
        eventBus.on(GameEventType.TOGGLE_HUD, callback);

        eventBus.emit(GameEventType.TOGGLE_HUD, { show: true });

        expect(callback).toHaveBeenCalledWith({ show: true });
    });

    it('should handle events without payloads (void)', () => {
        const callback = vi.fn();
        eventBus.on(GameEventType.SHOW_SETTINGS, callback);

        eventBus.emit(GameEventType.SHOW_SETTINGS, undefined as any);

        expect(callback).toHaveBeenCalled();
    });

    it('should maintain type safety (demonstrated by successful compilation/run)', () => {
        const callback = vi.fn();
        eventBus.on(GameEventType.SET_AI_DIFFICULTY, (payload) => {
            expect(payload.difficulty).toBeDefined();
            callback(payload.difficulty);
        });

        // eventBus.emit(GameEventType.SET_AI_DIFFICULTY, { diff: 'easy' });

        eventBus.emit(GameEventType.SET_AI_DIFFICULTY, { difficulty: 'easy' as any });
        expect(callback).toHaveBeenCalledWith('easy');
    });
});
