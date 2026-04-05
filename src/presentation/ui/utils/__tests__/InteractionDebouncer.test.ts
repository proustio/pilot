import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InteractionDebouncer } from '../InteractionDebouncer';
import { Config } from '../../../../infrastructure/config/Config';

describe('InteractionDebouncer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        InteractionDebouncer.resetTimer();
        InteractionDebouncer.enable();
    });

    afterEach(() => {
        InteractionDebouncer.disable();
        vi.restoreAllMocks();
    });

    it('should allow the first click immediately', () => {
        const listener = vi.fn();
        document.addEventListener('click', listener);

        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        vi.spyOn(performance, 'now').mockReturnValue(100);
        
        document.dispatchEvent(event);
        expect(listener).toHaveBeenCalledTimes(1);

        document.removeEventListener('click', listener);
    });

    it('should debounce subsequent clicks within interactionTimeout', () => {
        const listener = vi.fn();
        document.addEventListener('click', listener);

        vi.spyOn(performance, 'now').mockReturnValue(100);
        document.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        vi.spyOn(performance, 'now').mockReturnValue(200);
        const secondEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        document.dispatchEvent(secondEvent);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(secondEvent.defaultPrevented).toBe(true);

        document.removeEventListener('click', listener);
    });

    it('should allow clicks after the interactionTimeout has passed', () => {
        const listener = vi.fn();
        document.addEventListener('click', listener);

        vi.spyOn(performance, 'now').mockReturnValue(100);
        document.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        vi.spyOn(performance, 'now').mockReturnValue(100 + Config.timing.interactionTimeout + 1);
        document.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(listener).toHaveBeenCalledTimes(2);

        document.removeEventListener('click', listener);
    });
});
