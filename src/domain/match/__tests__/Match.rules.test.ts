import { describe, it, expect, beforeEach } from 'vitest';
import { Match, MatchMode } from '../Match';
import { Board } from '../../board/Board';
import { Ship, Orientation } from '../../fleet/Ship';

describe('Match placement rules', () => {
    describe('Russian Mode', () => {
        let match: Match;
        let board: Board;

        beforeEach(() => {
            match = new Match(MatchMode.Russian, 10, 10);
            board = match.playerBoard;
        });

        it('disallows placement touching an existing ship (cardinal)', () => {
            const ship1 = new Ship('s1', 2);
            board.placeShip(ship1, 5, 5, Orientation.Horizontal); // Occupies (5,5), (6,5)

            const ship2 = new Ship('s2', 2);
            // Cardinal touch (right)
            expect(match.validatePlacement(board, ship2, 7, 5, Orientation.Horizontal)).toBe(false);
            // Cardinal touch (left)
            expect(match.validatePlacement(board, ship2, 3, 5, Orientation.Horizontal)).toBe(false);
            // Cardinal touch (top)
            expect(match.validatePlacement(board, ship2, 5, 4, Orientation.Horizontal)).toBe(false);
            // Cardinal touch (bottom)
            expect(match.validatePlacement(board, ship2, 5, 6, Orientation.Horizontal)).toBe(false);
        });

        it('disallows placement touching an existing ship (diagonal)', () => {
            const ship1 = new Ship('s1', 2);
            board.placeShip(ship1, 5, 5, Orientation.Horizontal); // Occupies (5,5), (6,5)

            const ship2 = new Ship('s2', 1);
            // Diagonal touch (top-left of head)
            expect(match.validatePlacement(board, ship2, 4, 4, Orientation.Horizontal)).toBe(false);
            // Diagonal touch (bottom-left of head)
            expect(match.validatePlacement(board, ship2, 4, 6, Orientation.Horizontal)).toBe(false);
            // Diagonal touch (top-right of tail)
            expect(match.validatePlacement(board, ship2, 7, 4, Orientation.Horizontal)).toBe(false);
            // Diagonal touch (bottom-right of tail)
            expect(match.validatePlacement(board, ship2, 7, 6, Orientation.Horizontal)).toBe(false);
        });

        it('allows placement if not touching', () => {
            const ship1 = new Ship('s1', 2);
            board.placeShip(ship1, 5, 5, Orientation.Horizontal); // Occupies (5,5), (6,5)

            const ship2 = new Ship('s2', 1);
            // Far enough away
            expect(match.validatePlacement(board, ship2, 2, 2, Orientation.Horizontal)).toBe(true);
            expect(match.validatePlacement(board, ship2, 5, 7, Orientation.Horizontal)).toBe(true);
            expect(match.validatePlacement(board, ship2, 8, 5, Orientation.Horizontal)).toBe(true);
        });
    });

    describe('Rogue Mode', () => {
        let match: Match;
        let board: Board;

        beforeEach(() => {
            // Rogue mode uses 20x20
            match = new Match(MatchMode.Rogue, 20, 20);
            board = match.sharedBoard;
        });

        it('enforces player ship placement in Top-Left quadrant (0-6, 0-6)', () => {
            const playerShip = new Ship('p1', 3);
            playerShip.isEnemy = false;

            // Valid Top-Left
            expect(match.validatePlacement(board, playerShip, 0, 0, Orientation.Horizontal)).toBe(true);
            expect(match.validatePlacement(board, playerShip, 4, 4, Orientation.Horizontal)).toBe(true);

            // Invalid (out of 7x7 quadrant)
            expect(match.validatePlacement(board, playerShip, 7, 0, Orientation.Horizontal)).toBe(false);
            expect(match.validatePlacement(board, playerShip, 0, 7, Orientation.Horizontal)).toBe(false);
            expect(match.validatePlacement(board, playerShip, 5, 0, Orientation.Horizontal)).toBe(false); // Tail would be at x=7
        });

        it('enforces enemy ship placement in Bottom-Right quadrant (13-19, 13-19)', () => {
            const enemyShip = new Ship('e1', 3);
            enemyShip.isEnemy = true;

            // Valid Bottom-Right
            expect(match.validatePlacement(board, enemyShip, 13, 13, Orientation.Horizontal)).toBe(true);
            expect(match.validatePlacement(board, enemyShip, 17, 17, Orientation.Horizontal)).toBe(true);

            // Invalid (out of 7x7 quadrant)
            expect(match.validatePlacement(board, enemyShip, 12, 13, Orientation.Horizontal)).toBe(false);
            expect(match.validatePlacement(board, enemyShip, 13, 12, Orientation.Horizontal)).toBe(false);
            expect(match.validatePlacement(board, enemyShip, 0, 0, Orientation.Horizontal)).toBe(false);
        });
    });
});
