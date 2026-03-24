import { describe, it, expect, beforeEach } from 'vitest';
import { AIEngine } from '../AIEngine';
import { Board, CellState } from '../../../domain/board/Board';
import { Match, MatchMode } from '../../../domain/match/Match';
import { Ship, Orientation } from '../../../domain/fleet/Ship';

describe('AIEngine Strategy', () => {
    let ai: AIEngine;
    let match: Match;
    let board: Board;

    beforeEach(() => {
        ai = new AIEngine();
        match = new Match(MatchMode.Classic, 10, 10);
        board = match.playerBoard; // AI targets player board in Classic
    });

    describe('Hard AI Heatmap Strategy', () => {
        it('avoids known misses in heatmap calculation', () => {
            ai.setDifficulty('hard');
            
            // Place a ship but mark almost everything else as Miss
            const ship = new Ship('s1', 2);
            board.placeShip(ship, 0, 0, Orientation.Horizontal);
            
            // Mark (1,0) as Miss - heat should be 0 there
            board.gridState[1] = CellState.Miss;

            const move = ai.computeNextMove(board, match);
            
            // The move should not be at (1,0)
            expect(move.x === 1 && move.z === 0).toBe(false);
        });

        it('targets areas that can actually fit ships', () => {
            ai.setDifficulty('hard');
            
            // 3x3 board for simplicity in thought, but we use 10x10.
            // Block all but a 2x1 area.
            for (let i = 0; i < 100; i++) board.gridState[i] = CellState.Miss;
            
            // Open (0,0) and (1,0)
            board.gridState[0] = CellState.Empty;
            board.gridState[1] = CellState.Empty;
            
            // Give AI a size 2 ship to "search" for
            const ship = new Ship('target', 2);
            board.ships = [ship]; 

            const move = ai.computeNextMove(board, match);
            expect(move.z).toBe(0);
            expect(move.x).toBeLessThanOrEqual(1);
        });
    });

    describe('Rogue Mode Awareness', () => {
        it('avoids targeting its own ships on the shared board', () => {
            match = new Match(MatchMode.Rogue, 20, 20);
            const sharedBoard = match.sharedBoard;
            ai.setDifficulty('hard');

            // Place an enemy (AI) ship
            const enemyShip = new Ship('e1', 3);
            enemyShip.isEnemy = true;
            sharedBoard.placeShip(enemyShip, 15, 15, Orientation.Horizontal);

            // Run move many times to be sure
            for (let i = 0; i < 20; i++) {
                const move = ai.computeNextMove(sharedBoard, match);
                const isOnEnemyShip = enemyShip.occupies(move.x, move.z);
                expect(isOnEnemyShip).toBe(false);
            }
        });

        it('respects quadrant restrictions for ship fitting experiments', () => {
            match = new Match(MatchMode.Rogue, 20, 20);
            const sharedBoard = match.sharedBoard;
            ai.setDifficulty('hard');

            // Add a player ship so the AI has something to hunt for in the heatmap
            const playerShip = new Ship('p1', 3);
            playerShip.isEnemy = false;
            sharedBoard.ships.push(playerShip);

            // Clear board to ensure random seed doesn't bias too much
            for (let i = 0; i < 400; i++) sharedBoard.gridState[i] = CellState.Empty;
            
            const move = ai.computeNextMove(sharedBoard, match);
            
            // The target should be in the player's starting quadrant (0-6, 0-6)
            expect(move.x).toBeLessThan(7);
            expect(move.z).toBeLessThan(7);
        });
    });
});
