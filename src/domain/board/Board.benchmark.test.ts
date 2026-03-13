
import { describe, it } from 'vitest';
import { Board } from './Board';
import { Ship, Orientation } from '../fleet/Ship';

describe('Board Performance Benchmark', () => {
    it('benchmarks board operations', () => {
        const ITERATIONS = 10000;
        const BOARD_SIZE = 100;

        const start = performance.now();

        for (let i = 0; i < ITERATIONS; i++) {
            const board = new Board(BOARD_SIZE, BOARD_SIZE);

            // Place some ships
            for (let j = 0; j < 10; j++) {
                const ship = new Ship(`ship-${j}`, 5);
                board.placeShip(ship, j, j * 5, Orientation.Horizontal);
            }

            // Perform some attacks
            for (let x = 0; x < BOARD_SIZE; x += 10) {
                for (let z = 0; z < BOARD_SIZE; z += 10) {
                    board.receiveAttack(x, z);
                }
            }

            // Check if all ships sunk
            board.allShipsSunk();
        }

        const end = performance.now();
        console.log(`Benchmark completed in ${end - start}ms`);
    });
});
