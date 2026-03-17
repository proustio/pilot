import { describe, it, expect, bench } from 'vitest';
import { AIEngine } from './AIEngine';
import { Board, AttackResult } from '../../domain/board/Board';

describe('AIEngine Performance', () => {
    it('measures reportResult performance with a large huntStack', () => {
        const ai = new AIEngine();
        ai.setDifficulty('hard');

        // Create a large board (e.g., 100x100) to ensure we don't go out of bounds easily
        // and can add many items to the huntStack
        const board = new Board(100, 100);

        // Pre-fill the huntStack by simulating many hits
        // Doing this manually to bypass the `some` check initially, or just by calling reportResult
        // actually, calling reportResult many times is a good test of the O(N) `some` bottleneck

        const startTime = performance.now();

        const NUM_HITS = 2000;
        let x = 50;
        let z = 50;

        // Let's simulate hits around a central area.
        for (let i = 0; i < NUM_HITS; i++) {
             // Just cycle around to create overlapping adjacent cells
             const offsetX = i % 10;
             const offsetZ = Math.floor(i / 10) % 10;
             ai.reportResult(50 + offsetX, 50 + offsetZ, AttackResult.Hit, board);
        }

        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(`[Baseline] reportResult with ${NUM_HITS} hits took: ${duration.toFixed(2)}ms`);

        // Asserting that it completes is sufficient, the console.log will show the timing
        expect(duration).toBeGreaterThanOrEqual(0);
    });
});
