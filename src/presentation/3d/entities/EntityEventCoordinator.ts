import { EntityManager } from './EntityManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { ShipAnimator } from './ShipAnimator';
import { Config } from '../../../infrastructure/config/Config';
import { SonarEffect } from './SonarEffect';
import { Orientation } from '../../../domain/fleet/Ship';
import * as THREE from 'three';

export class EntityEventCoordinator {
    constructor(private em: EntityManager) {
        this.setupListeners();
    }

    private setupListeners() {
        eventBus.on(GameEventType.ACTIVE_SHIP_CHANGED, (payload) => {
            this.em.activeRogueShipId = payload.ship?.id || null;
        });

        eventBus.on(GameEventType.RESUME_GAME, () => {
            if (!this.em.isBusy()) {
                eventBus.emit(GameEventType.GAME_ANIMATIONS_COMPLETE, undefined as any);
            }
        });

        eventBus.on(GameEventType.REQUEST_MARKER_CLEANUP, () => {
            this.em.clearTransientMarkers();
        });

        eventBus.on(GameEventType.SHIP_STARTED_SINKING, (shipGroup: THREE.Object3D) => {
            if (!this.em.animationTracker.activelySinkingShips.includes(shipGroup)) {
                this.em.animationTracker.activelySinkingShips.push(shipGroup);
            }
        });

        eventBus.on(GameEventType.ROGUE_MOVE_SHIP, () => {
            this.em.fogManager.markFogDirty();
            this.em.visibilityManager.forceUpdate();
        });

        eventBus.on(GameEventType.ROGUE_PATH_MOVE, (payload) => {
            const shipGroup = this.em.shipAnimator.findShipGroup(payload.shipId);
            if (shipGroup) {
                this.em.shipAnimator.animateAlongPath(
                    shipGroup,
                    payload.path,
                    payload.finalOrientation,
                    payload.animationDurationMs
                );
                // Register for per-frame turret transform updates during the animation
                if (!this.em.animationTracker.activelyMovingShips.includes(shipGroup)) {
                    this.em.animationTracker.activelyMovingShips.push(shipGroup);
                }
            }

            // Spawn water ripples evenly spaced across the animation duration
            if (payload.path.length > 0) {
                const boardOffset = Config.board.width / 2;
                const interval = payload.animationDurationMs / payload.path.length;
                payload.path.forEach((cell: any, i: number) => {
                    setTimeout(() => {
                        const worldX = cell.x - boardOffset + 0.5;
                        const worldZ = cell.z - boardOffset + 0.5;
                        this.em.waterManager.addRipple(worldX, worldZ, true);
                    }, interval * i);
                });
            }
        });

        eventBus.on(GameEventType.ROGUE_SHIP_RAMMED, (payload) => {
            const boardOffset = Config.board.width / 2;
            const worldX = payload.contactX - boardOffset + 0.5;
            const worldZ = payload.contactZ - boardOffset + 0.5;

            // Spawn reduced-intensity collision particle burst at contact point
            this.em.particleSystem.spawnExplosion(worldX, 0.4, worldZ, this.em.playerBoardGroup);

            // Trigger camera shake
            this.em.animationTracker.triggerCameraShake(300, 0.15);

            // Animate rammer's 90° rotation smoothly
            const rammerGroup = this.em.shipAnimator.findShipGroup(payload.rammerShipId);
            if (rammerGroup) {
                const targetRotY = ShipAnimator.orientationToRotationY(payload.rammerNewOrientation);
                const turnDuration = Config.timing.rogueTurnDurationMs * Config.timing.gameSpeedMultiplier;
                rammerGroup.userData.rotationAnim = {
                    startRotY: rammerGroup.rotation.y,
                    targetRotY,
                    elapsedMs: 0,
                    durationMs: turnDuration,
                };
            }
        });

        eventBus.on(GameEventType.MINE_PLACED, (payload) => {
            const ship = this.em.visibilityManager.allShips.find(s => s.specialType === 'mine' && s.headX === payload.x && s.headZ === payload.z);
            if (ship) this.em.addShip(ship, payload.x, payload.z, Orientation.Horizontal, payload.isPlayer);
        });

        eventBus.on(GameEventType.SONAR_PLACED, (payload) => {
            const ship = this.em.visibilityManager.allShips.find(s => s.specialType === 'sonar' && s.headX === payload.x && s.headZ === payload.z);
            if (ship) this.em.addShip(ship, payload.x, payload.z, Orientation.Horizontal, payload.isPlayer);
        });

        eventBus.on(GameEventType.SONAR_RESULTS, (payload) => {
            const { hits } = payload;
            hits.forEach((h: any) => {
                this.em.fogManager.revealCellTemporarily(h.x, h.z, 2);
            });

            if (hits.length > 0) {
                const targetX = hits[0].x;
                const targetZ = hits[0].z;
                const boardOffset = Config.board.width / 2;
                const worldX = targetX - boardOffset + 0.5;
                const worldZ = targetZ - boardOffset + 0.5;

                this.em.animationTracker.addSonarEffect(new SonarEffect(worldX, worldZ, 3, this.em.playerBoardGroup));
            }
        });
    }
}
