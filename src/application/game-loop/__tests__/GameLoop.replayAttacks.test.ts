/**
 * Bug Condition Exploration Test — Property 1
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * CRITICAL: This test MUST FAIL on unfixed code.
 * Failure confirms the bug: loadMatch() never fires attackResultListeners
 * for persisted attack state in Board.gridState.
 *
 * When the fix is applied (task 3), this same test will pass,
 * confirming the bug is resolved.
 */

import { describe, it, expect, vi } from 'vitest';
import { GameLoop } from '../GameLoop';
import { Match, MatchMode } from '../../../domain/match/Match';
import { CellState } from '../../../domain/board/Board';
import { Config } from '../../../infrastructure/config/Config';
import { Storage } from '../../../infrastructure/storage/Storage';

describe('GameLoop.loadMatch() — attack replay bug condition', () => {
    it('fires onAttackResult callbacks for every Hit/Miss/Sunk cell in both boards on load', () => {
        const gameLoop = new GameLoop(Config, Storage);
        const match = new Match(MatchMode.Classic, 10, 10);

        // Set up player board attack state (enemy fired these):
        //   Hit  at (3, 4) → index = 4 * 10 + 3 = 43
        //   Miss at (7, 2) → index = 2 * 10 + 7 = 27
        match.playerBoard.gridState[4 * 10 + 3] = CellState.Hit;
        match.playerBoard.gridState[2 * 10 + 7] = CellState.Miss;

        // Set up enemy board attack state (player fired these):
        //   Sunk at (1,1),(2,1),(3,1) → indices 11, 12, 13
        match.enemyBoard.gridState[1 * 10 + 1] = CellState.Sunk;
        match.enemyBoard.gridState[1 * 10 + 2] = CellState.Sunk;
        match.enemyBoard.gridState[1 * 10 + 3] = CellState.Sunk;

        // Register spy via onAttackResult
        const spy = vi.fn();
        gameLoop.onAttackResult(spy);

        // Load the match — this should replay all attack state
        gameLoop.loadMatch(match);

        // Expect 5 total callbacks (2 on player board + 3 on enemy board)
        expect(spy).toHaveBeenCalledTimes(5);

        // Player board hits/misses → enemy fired → isPlayer = false, isReplay = true
        expect(spy).toHaveBeenCalledWith(3, 4, 'hit', false, true);
        expect(spy).toHaveBeenCalledWith(7, 2, 'miss', false, true);

        // Enemy board sunk cells → player fired → isPlayer = true, isReplay = true
        expect(spy).toHaveBeenCalledWith(1, 1, 'sunk', true, true);
        expect(spy).toHaveBeenCalledWith(2, 1, 'sunk', true, true);
        expect(spy).toHaveBeenCalledWith(3, 1, 'sunk', true, true);
    });
});
