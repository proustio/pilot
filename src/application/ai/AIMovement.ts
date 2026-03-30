import { Board, CellState } from '../../domain/board/Board';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { Match } from '../../domain/match/Match';
import { getIndex } from '../../domain/board/BoardUtils';
import type { AIDifficulty } from './AIEngine';

/**
 * Handles Rogue-mode movement decisions and pathfinding for AI ships.
 * Pure logic — receives Board, Match, and difficulty as parameters.
 */
export class AIMovement {

    /**
     * Decides whether the AI ship should move or attack.
     * Returns 'move' | 'attack' | 'skip'
     */
    public decideAction(ship: Ship, board: Board, _match: Match, difficulty: AIDifficulty): 'move' | 'attack' | 'skip' {
        if (ship.hasActedThisTurn) return 'skip';

        const visibleEnemy = this.findVisibleEnemyInRange(ship, board, 10);

        if (difficulty === 'easy') {
            return (visibleEnemy && this.getDistance(ship.headX, ship.headZ, visibleEnemy.x, visibleEnemy.z) <= 10) ? 'attack' : 'move';
        } else {
            const isDamaged = ship.segments.some(s => !s);
            if (isDamaged) return 'move';

            return (visibleEnemy && this.getDistance(ship.headX, ship.headZ, visibleEnemy.x, visibleEnemy.z) <= 10) ? 'attack' : 'move';
        }
    }

    /**
     * Computes the next movement target for an AI ship.
     */
    public computeMove(ship: Ship, board: Board, match: Match, difficulty: AIDifficulty): { x: number, z: number, orientation: Orientation } | null {
        if (ship.movesRemaining <= 0) return null;

        const isEasy = difficulty === 'easy';
        const detectedEnemy = this.findVisibleEnemyInRange(ship, board, ship.visionRadius + 5);

        let bestTarget: { x: number, z: number, orientation: Orientation } | null = null;
        let minDistanceToGoal = Infinity;

        const goalX = detectedEnemy ? detectedEnemy.x : 3;
        const goalZ = detectedEnemy ? detectedEnemy.z : 3;

        const radius = Math.ceil(ship.movesRemaining / 0.5);
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const tx = ship.headX + dx;
                const tz = ship.headZ + dz;

                if (board.isOutOfBounds(tx, tz)) continue;
                if (tx === ship.headX && tz === ship.headZ) continue;

                const cost = ship.calculateMoveCost(tx, tz);
                if (cost > 0 && cost <= ship.movesRemaining) {
                    const orients = [ship.orientation, ship.orientation === Orientation.Horizontal ? Orientation.Vertical : Orientation.Horizontal];
                    for (const orient of orients) {
                        if (match.validatePlacement(board, ship, tx, tz, orient, ship)) {
                            const dist = this.getDistance(tx, tz, goalX, goalZ);
                            let score: number;

                            if (isEasy || !detectedEnemy) {
                                score = dist + (isEasy ? Math.random() * 2 : 0);
                            } else {
                                if (dist < 8) {
                                    score = 20 - dist;
                                } else if (dist > 10) {
                                    score = dist;
                                } else {
                                    score = 0;
                                }
                            }

                            if (score < minDistanceToGoal) {
                                minDistanceToGoal = score;
                                bestTarget = { x: tx, z: tz, orientation: orient };
                            }
                        }
                    }
                }
            }
        }

        return bestTarget;
    }

    public getDistance(x1: number, z1: number, x2: number, z2: number): number {
        return Math.max(Math.abs(x1 - x2), Math.abs(z1 - z2)); // Chebyshev
    }

    public findVisibleEnemyInRange(ship: Ship, board: Board, range: number): { x: number, z: number } | null {
        for (const playerShip of board.ships) {
            if (playerShip.isEnemy) continue;
            if (playerShip.isSunk()) continue;

            const coords = playerShip.getOccupiedCoordinates();
            for (const c of coords) {
                const dist = this.getDistance(ship.headX, ship.headZ, c.x, c.z);
                if (dist <= range) {
                    const idx = getIndex(c.x, c.z, board.width);
                    const state = board.gridState[idx];
                    if (state === CellState.Hit || dist <= ship.visionRadius) {
                        return { x: c.x, z: c.z };
                    }
                }
            }
        }
        return null;
    }
}
