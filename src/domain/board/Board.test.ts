import { describe, it, expect, beforeEach } from 'vitest';
import { Board, AttackResult } from './Board';
import { Ship, Orientation } from '../fleet/Ship';

describe('Board receiveAttack boundary logic', () => {
    let board: Board;

    beforeEach(() => {
        board = new Board(10, 10);
    });

    it('returns AttackResult.Invalid for out-of-bounds coordinates', () => {
        // Negative coordinates
        expect(board.receiveAttack(-1, 5)).toBe(AttackResult.Invalid);
        expect(board.receiveAttack(5, -1)).toBe(AttackResult.Invalid);
        expect(board.receiveAttack(-1, -1)).toBe(AttackResult.Invalid);

        // Coordinates beyond width/height
        expect(board.receiveAttack(10, 5)).toBe(AttackResult.Invalid);
        expect(board.receiveAttack(5, 10)).toBe(AttackResult.Invalid);
        expect(board.receiveAttack(10, 10)).toBe(AttackResult.Invalid);
        expect(board.receiveAttack(100, 100)).toBe(AttackResult.Invalid);
    });

    it('returns AttackResult.Invalid for repeated attacks on an already missed cell', () => {
        // First attack on empty cell returns Miss
        expect(board.receiveAttack(2, 2)).toBe(AttackResult.Miss);

        // Subsequent attack on the same cell should be Invalid
        expect(board.receiveAttack(2, 2)).toBe(AttackResult.Invalid);
    });

    it('returns AttackResult.Invalid for repeated attacks on an already hit cell', () => {
        const ship = new Ship('ship-1', 3);
        board.placeShip(ship, 3, 3, Orientation.Horizontal);

        // First attack on ship cell returns Hit
        expect(board.receiveAttack(3, 3)).toBe(AttackResult.Hit);

        // Subsequent attack on the same hit cell should be Invalid
        expect(board.receiveAttack(3, 3)).toBe(AttackResult.Invalid);
    });

    it('returns AttackResult.Invalid for repeated attacks on an already sunk cell', () => {
        const ship = new Ship('ship-2', 2);
        board.placeShip(ship, 5, 5, Orientation.Vertical);

        // First hit
        expect(board.receiveAttack(5, 5)).toBe(AttackResult.Hit);

        // Second hit sinks the ship
        expect(board.receiveAttack(5, 6)).toBe(AttackResult.Sunk);

        // Subsequent attacks on any of the sunk ship's cells should be Invalid
        expect(board.receiveAttack(5, 5)).toBe(AttackResult.Invalid);
        expect(board.receiveAttack(5, 6)).toBe(AttackResult.Invalid);
    });
});
