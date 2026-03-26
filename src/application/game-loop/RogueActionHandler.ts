import { GameLoop, GameState } from './GameLoop';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { eventBus, GameEventType } from '../events/GameEventBus';

export class RogueActionHandler {
    constructor(private gameLoop: GameLoop) {}

    public handleAttemptMove(targetX: number, targetZ: number): void {
        const { match, currentState } = this.gameLoop;
        const config = this.gameLoop.getConfig();
        if (!match || currentState !== GameState.PLAYER_TURN || config.autoBattler) return;
        
        const sharedBoard = match.sharedBoard;
        const ship = this.gameLoop.rogueShipOrder[this.gameLoop.activeRogueShipIndex];
        if (!ship || ship.hasActedThisTurn || ship.movesRemaining <= 0) return;

        const dx = targetX - ship.headX;
        const dz = targetZ - ship.headZ;
        const dist = Math.abs(dx) + Math.abs(dz);
        
        if (dist === 0) return;

        let totalCost = 0;
        const isHorizontal = ship.orientation === Orientation.Horizontal;
        const moveDirX = targetX > ship.headX ? 1 : (targetX < ship.headX ? -1 : 0);
        const moveDirZ = targetZ > ship.headZ ? 1 : (targetZ < ship.headZ ? -1 : 0);
        
        if (isHorizontal) {
            if (moveDirZ !== 0) totalCost = dist; // Lateral
            else if (moveDirX > 0) totalCost = dist * 0.5; // Forward
            else totalCost = dist * 2.0; // Backward
        } else {
            if (moveDirX !== 0) totalCost = dist; // Lateral
            else if (moveDirZ > 0) totalCost = dist * 0.5; // Forward
            else totalCost = dist * 2.0; // Backward
        }

        if (totalCost > 0 && totalCost <= ship.movesRemaining) {
            let newOrient = ship.orientation;
            if (Math.abs(dx) > Math.abs(dz)) newOrient = Orientation.Horizontal;
            else if (Math.abs(dz) > Math.abs(dx)) newOrient = Orientation.Vertical;

            const moveResult = sharedBoard.moveShip(ship, targetX, targetZ, newOrient);
            if (moveResult.success) {
                if (moveResult.hitMine) {
                    this.gameLoop.onAttackResultInvoke(moveResult.mineX!, moveResult.mineZ!, 'hit', true, false);
                }
                ship.movesRemaining = Math.max(0, ship.movesRemaining - totalCost);
                
                const queuedAbility = (window as any).queuedRogueAbility;
                if (queuedAbility) {
                    if (queuedAbility === 'sonar' && Ship.resources.sonars > 0) {
                        Ship.resources.sonars--;
                        this.disperseAbilityAlongPath(ship, targetX, targetZ, 'sonar');
                    } else if (queuedAbility === 'mine' && Ship.resources.mines > 0) {
                        Ship.resources.mines--;
                        this.disperseAbilityAlongPath(ship, targetX, targetZ, 'mine');
                    }
                    (window as any).queuedRogueAbility = null;
                    ship.hasActedThisTurn = true;
                    ship.movesRemaining = 0;
                }

                this.gameLoop.onShipMovedInvoke(ship, targetX, targetZ, newOrient);
                this.gameLoop.requestAutoSave();

                if (ship.movesRemaining <= 0 || ship.hasActedThisTurn) {
                    this.gameLoop.isAnimating = true;
                    setTimeout(() => {
                        this.gameLoop.isAnimating = false;
                        this.advanceRogueShipTurn();
                    }, 800);
                }
            }
        }
    }

    public advanceRogueShipTurn(): void {
        this.gameLoop.activeRogueShipIndex++;
        
        while (this.gameLoop.activeRogueShipIndex < this.gameLoop.rogueShipOrder.length) {
            const ship = this.gameLoop.rogueShipOrder[this.gameLoop.activeRogueShipIndex];
            if (!ship.isSunk()) {
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
