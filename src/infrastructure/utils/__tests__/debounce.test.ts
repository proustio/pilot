import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../debounce';

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should call the function immediately on the first call', () => {
        const func = vi.fn();
        const debouncedFunc = debounce(func, 300);

        debouncedFunc();
        expect(func).toHaveBeenCalledTimes(1);
    });

    it('should debounce subsequent calls within the timeout period', () => {
        const func = vi.fn();
        const debouncedFunc = debounce(func, 300);

        debouncedFunc();
        debouncedFunc();
        debouncedFunc();
        expect(func).toHaveBeenCalledTimes(1);
    });

    it('should call the function again after the timeout period', () => {
        const func = vi.fn();
        const debouncedFunc = debounce(func, 300);

        debouncedFunc();
        expect(func).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(300);
        debouncedFunc();
        expect(func).toHaveBeenCalledTimes(2);
    });

    it('should reset the timeout if called again before the timeout expires', () => {
        const func = vi.fn();
        const debouncedFunc = debounce(func, 300);

        debouncedFunc();
        expect(func).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(200);
        debouncedFunc(); // resets timeout to 300
        expect(func).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(200);
        debouncedFunc(); // resets timeout again, still 1 call
        expect(func).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(300);
        debouncedFunc(); // finally allows 2nd call
        expect(func).toHaveBeenCalledTimes(2);
    });
});
