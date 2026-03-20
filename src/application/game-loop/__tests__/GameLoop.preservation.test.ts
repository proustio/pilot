/**
 * Preservation Property Tests — Property 2
 *
 * Validates: Requirements 3.1, 3.2, 3.4
 *
 * These tests MUST PASS on UNFIXED code.
 * They establish the baseline behavior that must be preserved after the fix.
 *
 * Observations on unfixed code:
 *  - startNewMatch() fires shipPlacedListeners but never fires attackResultListeners
 *  - onGridClick() during PLAYER_TURN fires attackResultListeners with (x, z, result, isPlayer)
 *    — 4 args, no isReplay parameter (5th arg is undefined)
 *  - handleEnemyTurn() fires attackResultListeners with (x, z, result, false)
 *    — 4 args, no isReplay parameter (5th arg is undefined)
 */

import { describe, it, expect, vi } from 'vitest';
import { GameLoop, GameState } from '../GameLoop';
import { Match, MatchMode } from '../../../domain/match/Match';
import { CellState } from '../../../domain/board/Board';
import { Config } from '../../../infrastructure/config/Config';
import { Storage } from '../../../infrastructure/storage/Storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a GameLoop with a fully started match (ships auto-placed, state = PLAYER_TURN).
 * We enable autoBattler only for the ship-placement phase of startNewMatch, then
 * immediately reset it and clear isAnimating so the game is in a clean PLAYER_TURN state.
 */
function createStartedGameLoop(): { gameLoop: GameLoop; match: Match } {
    Config.autoBattler = true;
    const gameLoop = new GameLoop(Config, Storage);
    const match = new Match(MatchMode.Classic, 10, 10);
    gameLoop.startNewMatch(match);
    // Reset autoBattler so onGridClick manual attacks are accepted
    Config.autoBattler = false;
    // handleAutoPlayerTurn() set isAnimating=true synchronously; clear it so
    // manual onGridClick calls are not blocked
    gameLoop.isAnimating = false;
    return { gameLoop, match };
}

/**
 * Find a cell on the enemy board that is in CellState.Ship (valid attack target).
 * Returns the first such (x, z) pair, or null if none found.
 */
function findValidAttackTarget(match: Match): { x: number; z: number } | null {
    for (let i = 0; i < match.enemyBoard.gridState.length; i++) {
        if (match.enemyBoard.gridState[i] === CellState.Ship) {
            const x = i % match.enemyBoard.width;
            const z = Math.floor(i / match.enemyBoard.width);
            return { x, z };
        }
    }
    // Fallback: find an empty cell
    for (let i = 0; i < match.enemyBoard.gridState.length; i++) {
        if (match.enemyBoard.gridState[i] === CellState.Empty) {
            const x = i % match.enemyBoard.width;
            const z = Math.floor(i / match.enemyBoard.width);
            return { x, z };
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Property 2a: startNewMatch() fires zero attackResultListeners
// ---------------------------------------------------------------------------

describe('Preservation — startNewMatch() fires zero attack callbacks', () => {
    /**
     * Property-based test: for any new match started via startNewMatch(),
     * the number of attackResultListeners invocations is exactly 0.
     *
     * We run this across multiple random seeds / match modes to act as a
     * property test without requiring an external PBT library.
     *
     * Validates: Requirements 3.1
     */
    it('never invokes attackResultListeners for Classic mode match', () => {
        Config.autoBattler = true;
        const gameLoop = new GameLoop(Config, Storage);
        const match = new Match(MatchMode.Classic, 10, 10);

        const spy = vi.fn();
        gameLoop.onAttackResult(spy);

        gameLoop.startNewMatch(match);
        Config.autoBattler = false;

        // handleAutoPlayerTurn fires via setTimeout — synchronously zero calls
        expect(spy).toHaveBeenCalledTimes(0);
    });

    it('never invokes attackResultListeners for Russian mode match', () => {
        Config.autoBattler = true;
        const gameLoop = new GameLoop(Config, Storage);
        const match = new Match(MatchMode.Russian, 10, 10);

        const spy = vi.fn();
        gameLoop.onAttackResult(spy);

        gameLoop.startNewMatch(match);
        Config.autoBattler = false;

        expect(spy).toHaveBeenCalledTimes(0);
    });

    it('property: zero attack callbacks across 20 independent startNewMatch() calls', () => {
        // Simulate property-based testing by running many independent instances
        for (let trial = 0; trial < 20; trial++) {
            Config.autoBattler = true;
            const gameLoop = new GameLoop(Config, Storage);
            const mode = trial % 2 === 0 ? MatchMode.Classic : MatchMode.Russian;
            const match = new Match(mode, 10, 10);

            const spy = vi.fn();
            gameLoop.onAttackResult(spy);

            gameLoop.startNewMatch(match);
            Config.autoBattler = false;

            // handleAutoPlayerTurn fires via setTimeout — synchronously zero calls
            expect(spy).toHaveBeenCalledTimes(0);
        }
    });
});

// ---------------------------------------------------------------------------
// Property 2b: live onGridClick() attack does NOT pass isReplay = true
// ---------------------------------------------------------------------------

describe('Preservation — live onGridClick() attack callback has isReplay != true', () => {
    /**
     * Property-based test: for any live attack via onGridClick() on a valid cell
     * during PLAYER_TURN, the callback is invoked with isReplay being false or
     * undefined (not true).
     *
     * Validates: Requirements 3.4
     */
    it('fires attackResultListeners with isReplay undefined (not true) on a valid attack', () => {
        const { gameLoop, match } = createStartedGameLoop();

        // Ensure we are in PLAYER_TURN
        expect(gameLoop.currentState).toBe(GameState.PLAYER_TURN);

        const target = findValidAttackTarget(match);
        expect(target).not.toBeNull();

        const spy = vi.fn();
        gameLoop.onAttackResult(spy);

        gameLoop.onGridClick(target!.x, target!.z);

        // The callback must have been called at least once
        expect(spy).toHaveBeenCalledTimes(1);

        // The 5th argument (isReplay) must NOT be true
        const [, , , , isReplay] = spy.mock.calls[0];
        expect(isReplay).not.toBe(true);
    });

    it('property: isReplay is never true across 10 independent live attacks', () => {
        for (let trial = 0; trial < 10; trial++) {
            const { gameLoop, match } = createStartedGameLoop();

            expect(gameLoop.currentState).toBe(GameState.PLAYER_TURN);

            const target = findValidAttackTarget(match);
            if (!target) continue; // skip if no valid cell (shouldn't happen)

            const spy = vi.fn();
            gameLoop.onAttackResult(spy);

            gameLoop.onGridClick(target.x, target.z);

            expect(spy).toHaveBeenCalledTimes(1);

            const [, , , , isReplay] = spy.mock.calls[0];
            expect(isReplay).not.toBe(true);
        }
    });

    it('live attack callback receives correct (x, z, result, isPlayer) signature', () => {
        const { gameLoop, match } = createStartedGameLoop();

        expect(gameLoop.currentState).toBe(GameState.PLAYER_TURN);

        const target = findValidAttackTarget(match);
        expect(target).not.toBeNull();

        const spy = vi.fn();
        gameLoop.onAttackResult(spy);

        gameLoop.onGridClick(target!.x, target!.z);

        expect(spy).toHaveBeenCalledTimes(1);

        const [cbX, cbZ, cbResult, cbIsPlayer] = spy.mock.calls[0];
        // Coordinates must match what was clicked
        expect(cbX).toBe(target!.x);
        expect(cbZ).toBe(target!.z);
        // Result must be a valid attack result string
        expect(['hit', 'miss', 'sunk']).toContain(cbResult);
        // isPlayer must be true — player attacked the enemy board
        expect(cbIsPlayer).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Backward-compatibility: AttackResultListener type accepts 4-parameter callbacks
// ---------------------------------------------------------------------------

describe('Backward-compatibility — AttackResultListener works with 4-parameter callbacks', () => {
    /**
     * Verifies that existing 4-parameter callbacks (x, z, result, isPlayer) still
     * work correctly when a 5th optional isReplay parameter is added to the type.
     *
     * This is a compile-time + runtime check: if the type signature breaks,
     * TypeScript will error and the test will fail.
     *
     * Validates: Requirements 3.1, 3.4
     */
    it('4-parameter callback is invoked correctly during a live attack', () => {
        const { gameLoop, match } = createStartedGameLoop();

        expect(gameLoop.currentState).toBe(GameState.PLAYER_TURN);

        const target = findValidAttackTarget(match);
        expect(target).not.toBeNull();

        // Deliberately use a 4-parameter callback (no isReplay) — must still work
        const received: Array<{ x: number; z: number; result: string; isPlayer: boolean }> = [];
        gameLoop.onAttackResult((x, z, result, isPlayer) => {
            received.push({ x, z, result, isPlayer });
        });

        gameLoop.onGridClick(target!.x, target!.z);

        expect(received).toHaveLength(1);
        expect(received[0].x).toBe(target!.x);
        expect(received[0].z).toBe(target!.z);
        expect(['hit', 'miss', 'sunk']).toContain(received[0].result);
        expect(received[0].isPlayer).toBe(true);
    });

    it('4-parameter callback registered via onAttackResult does not throw when 5th arg is passed', () => {
        const { gameLoop, match } = createStartedGameLoop();

        expect(gameLoop.currentState).toBe(GameState.PLAYER_TURN);

        const target = findValidAttackTarget(match);
        expect(target).not.toBeNull();

        // Simulate what happens after the fix: GameLoop will call listener with 5 args.
        // A 4-parameter callback must silently ignore the 5th arg — no throw.
        let callCount = 0;
        gameLoop.onAttackResult((x, z, result, isPlayer) => {
            // Intentionally ignores 5th arg — must not throw
            callCount++;
            void x; void z; void result; void isPlayer;
        });

        expect(() => gameLoop.onGridClick(target!.x, target!.z)).not.toThrow();
        expect(callCount).toBe(1);
    });
});
