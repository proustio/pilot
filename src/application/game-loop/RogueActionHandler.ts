import { GameLoop, GameState } from './GameLoop';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { CellState } from '../../domain/board/Board';
import { getIndex } from '../../domain/board/BoardUtils';
import { PathResolver } from '../../domain/board/PathResolver';
import { eventBus, GameEventType } from '../events/GameEventBus';
import { Config } from '../../infrastructure/config/Config';

export class RogueActionHandler {
    private pathResolver = new PathResolver();

    constructor(private gameLoop: GameLoop) { }

    public handleAttemptMove(targetX: number, targetZ: number): void {
        const { match, currentState } = this.gameLoop;
        const config = this.gameLoop.getConfig();
        console.log(`[${new Date().toISOString()}] RogueActionHandler: Move attempted to`, targetX, targetZ);
        if (!match || currentState !== GameState.PLAYER_TURN || config.autoBattler) return;

        const sharedBoard = match.sharedBoard;
        const ship = this.gameLoop.rogueShipOrder[this.gameLoop.activeRogueShipIndex];
        if (!ship || ship.hasActedThisTurn || ship.movesRemaining <= 0) return;

        // Static/dead entity guard
        if (ship.isSunk() || ship.isSpecialWeapon) return;

        const dx = targetX - ship.headX;
        const dz = targetZ - ship.headZ;
        const dist = Math.abs(dx) + Math.abs(dz);

        if (dist === 0) return;
        const totalCost = ship.calculateMoveCost(targetX, targetZ);
        if (totalCost <= 0 || totalCost > ship.movesRemaining) return;

        let newOrient = ship.orientation;
        if (Math.abs(dx) > Math.abs(dz)) newOrient = Orientation.Horizontal;
        else if (Math.abs(dz) > Math.abs(dx)) newOrient = Orientation.Vertical;

        const result = this.pathResolver.resolve(sharedBoard, ship, targetX, targetZ, newOrient);

        if (result.path.length === 0 && !result.rammed) return;

        // Determine final position and orientation
        let finalX = result.finalX;
        let finalZ = result.finalZ;
        let finalOrient = newOrient;

        if (result.rammed) {
            finalOrient = this.rotate90(ship.orientation);
        }

        // Physically relocate the ship on the board
        this.relocateShip(sharedBoard, ship, finalX, finalZ, finalOrient);

        // Handle mine hit
        if (result.hitMine && result.mineX !== undefined && result.mineZ !== undefined) {
            this.applyMineDamage(sharedBoard, ship, result.mineX, result.mineZ);
            this.gameLoop.onAttackResultInvoke(result.mineX, result.mineZ, 'hit', true, false);
        }

        // Handle ramming
        if (result.rammed && result.rammedShip) {
            this.applyRammingDamage(sharedBoard, ship, result.rammedShip, result.collisionCell!);

            eventBus.emit(GameEventType.ROGUE_SHIP_RAMMED, {
                rammerShipId: ship.id,
                rammedShipId: result.rammedShip.id,
                contactX: result.collisionCell!.x,
                contactZ: result.collisionCell!.z,
                rammerNewOrientation: finalOrient,
            });
        }

        ship.movesRemaining = 0;
        ship.hasActedThisTurn = true;

        // Emit path move event for animation
        const animDuration = Config.timing.rogueMoveDurationMs * Config.timing.gameSpeedMultiplier;
        eventBus.emit(GameEventType.ROGUE_PATH_MOVE, {
            shipId: ship.id,
            path: result.path,
            finalOrientation: finalOrient,
            animationDurationMs: animDuration,
        });

        // Handle queued abilities
        const queuedAbility = (window as any).queuedRogueAbility;
        if (queuedAbility) {
            if (queuedAbility === 'sonar' && Ship.resources.sonars > 0) {
                Ship.resources.sonars--;
                this.disperseAbilityAlongPath(ship, finalX, finalZ, 'sonar');
            } else if (queuedAbility === 'mine' && Ship.resources.mines > 0) {
                Ship.resources.mines--;
                this.disperseAbilityAlongPath(ship, finalX, finalZ, 'mine');
            }
            (window as any).queuedRogueAbility = null;
        }

        this.gameLoop.onShipMovedInvoke(ship, finalX, finalZ, finalOrient);
        this.gameLoop.requestAutoSave();

        this.gameLoop.isAnimating = true;
        setTimeout(() => {
            console.log(`[${new Date().toISOString()}] RogueActionHandler: Move completed`);
            this.gameLoop.isAnimating = false;
            this.advanceRogueShipTurn();
        }, animDuration);
    }

    public advanceRogueShipTurn(): void {
        this.gameLoop.activeRogueShipIndex++;

        while (this.gameLoop.activeRogueShipIndex < this.gameLoop.rogueShipOrder.length) {
            const ship = this.gameLoop.rogueShipOrder[this.gameLoop.activeRogueShipIndex];
            if (!ship.isSunk()) {
                console.log(`[${new Date().toISOString()}] RogueActionHandler: Active ship changed`, ship.id);
                eventBus.emit(GameEventType.ACTIVE_SHIP_CHANGED, { ship, index: this.gameLoop.activeRogueShipIndex });
                return;
            }
            this.gameLoop.activeRogueShipIndex++;
        }

        this.gameLoop.transitionTo(GameState.ENEMY_TURN);
    }

    public advanceEnemyRogueShipTurn(): void {
        this.gameLoop.activeEnemyRogueShipIndex++;

        while (this.gameLoop.activeEnemyRogueShipIndex < this.gameLoop.enemyRogueShipOrder.length) {
            const ship = this.gameLoop.enemyRogueShipOrder[this.gameLoop.activeEnemyRogueShipIndex];
            if (!ship.isSunk()) {
                this.gameLoop.getTurnExecutor().handleEnemyTurn();
                return;
            }
            this.gameLoop.activeEnemyRogueShipIndex++;
        }

        this.gameLoop.transitionTo(GameState.PLAYER_TURN);
    }

    /**
     * Rotates an orientation 90 degrees: Horizontal↔Vertical, Left↔Up.
     */
    private rotate90(orient: Orientation): Orientation {
        switch (orient) {
            case Orientation.Horizontal: return Orientation.Vertical;
            case Orientation.Vertical: return Orientation.Horizontal;
            case Orientation.Left: return Orientation.Up;
            case Orientation.Up: return Orientation.Left;
        }
    }

    /**
     * Physically moves a ship on the board by clearing old cells and writing new ones.
     */
    private relocateShip(board: import('../../domain/board/Board').Board, ship: Ship, newX: number, newZ: number, newOrient: Orientation): void {
        // Clear old cells
        const oldCoords = ship.getOccupiedCoordinates();
        for (const coord of oldCoords) {
            const idx = getIndex(coord.x, coord.z, board.width);
            board.gridState[idx] = CellState.Empty;
            board.shipMap.delete(`${coord.x},${coord.z}`);
        }

        // Update ship position
        ship.headX = newX;
        ship.headZ = newZ;
        ship.orientation = newOrient;

        // Write new cells
        const newCoords = ship.getOccupiedCoordinates();
        newCoords.forEach((coord, segmentIndex) => {
            const idx = getIndex(coord.x, coord.z, board.width);
            board.gridState[idx] = ship.segments[segmentIndex] ? CellState.Ship : CellState.Hit;
            board.shipMap.set(`${coord.x},${coord.z}`, { ship, segmentIndex });
        });
    }

    /**
     * Applies mine detonation damage to both the ship and the mine entity.
     */
    private applyMineDamage(board: import('../../domain/board/Board').Board, ship: Ship, mineX: number, mineZ: number): void {
        const mineShip = board.getShipAt(mineX, mineZ);
        if (mineShip && mineShip.specialType === 'mine') {
            // Find which segment of the ship overlaps or is nearest to the mine
            const coords = ship.getOccupiedCoordinates();
            let hitIdx = 0;
            let minDist = Infinity;
            for (let i = 0; i < coords.length; i++) {
                const d = Math.abs(coords[i].x - mineX) + Math.abs(coords[i].z - mineZ);
                if (d < minDist) { minDist = d; hitIdx = i; }
            }
            ship.hitSegment(hitIdx);
            mineShip.hitSegment(0);

            // Update mine cell to Sunk
            const mineIdx = getIndex(mineX, mineZ, board.width);
            board.gridState[mineIdx] = CellState.Sunk;

            // Check if ship sank from the mine
            if (ship.isSunk() && !ship.isSpecialWeapon) {
                board.aliveShipsCount--;
                const shipCoords = ship.getOccupiedCoordinates();
                for (const c of shipCoords) {
                    board.gridState[getIndex(c.x, c.z, board.width)] = CellState.Sunk;
                }
            }
        }
    }

    /**
     * Applies ramming damage: front segment of rammer, nearest segment of rammed ship.
     */
    private applyRammingDamage(board: import('../../domain/board/Board').Board, rammer: Ship, rammed: Ship, collisionCell: { x: number; z: number }): void {
        // Hit front segment (index 0) of the rammer
        rammer.hitSegment(0);

        // Hit nearest segment of the rammed ship to the collision point
        const rammedCoords = rammed.getOccupiedCoordinates();
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < rammedCoords.length; i++) {
            const d = Math.abs(rammedCoords[i].x - collisionCell.x) + Math.abs(rammedCoords[i].z - collisionCell.z);
            if (d < minDist) { minDist = d; nearestIdx = i; }
        }
        rammed.hitSegment(nearestIdx);

        // Update board state for damaged segments
        this.updateShipCellStates(board, rammer);
        this.updateShipCellStates(board, rammed);

        // Check sinking for both ships
        if (rammer.isSunk() && !rammer.isSpecialWeapon) {
            board.aliveShipsCount--;
            for (const c of rammer.getOccupiedCoordinates()) {
                board.gridState[getIndex(c.x, c.z, board.width)] = CellState.Sunk;
            }
        }
        if (rammed.isSunk() && !rammed.isSpecialWeapon) {
            board.aliveShipsCount--;
            for (const c of rammed.getOccupiedCoordinates()) {
                board.gridState[getIndex(c.x, c.z, board.width)] = CellState.Sunk;
            }
        }
    }

    /**
     * Syncs board cell states with a ship's segment health (Ship→Hit for damaged segments).
     */
    private updateShipCellStates(board: import('../../domain/board/Board').Board, ship: Ship): void {
        const coords = ship.getOccupiedCoordinates();
        coords.forEach((coord, i) => {
            const idx = getIndex(coord.x, coord.z, board.width);
            if (!ship.segments[i]) {
                board.gridState[idx] = CellState.Hit;
            }
        });
    }

    private disperseAbilityAlongPath(ship: Ship, targetX: number, targetZ: number, type: 'sonar' | 'mine') {
        const startX = ship.headX;
        const startZ = ship.headZ;
        const dx = targetX - startX;
        const dz = targetZ - startZ;
        const midX = Math.floor(startX + dx / 2);
        const midZ = Math.floor(startZ + dz / 2);
        const rx = midX + (Math.random() > 0.5 ? 1 : -1);
        const rz = midZ + (Math.random() > 0.5 ? 1 : -1);

        if (this.gameLoop.match && !this.gameLoop.match.sharedBoard.isOutOfBounds(rx, rz)) {
            const board = this.gameLoop.match.sharedBoard;
            if (type === 'sonar') {
                const placed = board.placeSonar(rx, rz);
                if (placed) {
                    eventBus.emit(GameEventType.SONAR_PLACED, { x: rx, z: rz, isPlayer: true });
                }
            } else {
                const placed = board.placeMine(rx, rz);
                if (placed) {
                    eventBus.emit(GameEventType.MINE_PLACED, { x: rx, z: rz, isPlayer: true });
                }
            }
        }
    }
}
