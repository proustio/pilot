import * as THREE from 'three';
import { Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';

/**
 * Handles ship animation logic extracted from EntityManager:
 * - Sinking descent animation (with break-apart for broken ships)
 * - Movement lerp (smooth position transitions)
 * - Active ship highlight pulsing (Rogue mode)
 * - Placement zone highlight (Rogue setup phase)
 */
export class ShipAnimator {
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    private placementHighlightMesh?: THREE.Mesh;

    constructor(playerBoardGroup: THREE.Group, enemyBoardGroup: THREE.Group) {
        this.playerBoardGroup = playerBoardGroup;
        this.enemyBoardGroup = enemyBoardGroup;
    }

    /**
     * Runs all ship animation updates for the current frame.
     */
    public update(time: number, activeRogueShipId: string | null, isPlayerTurn: boolean, isSetupPhase: boolean): void {
        this.updateShipAnimations();
        this.updateShipHighlighting(time, activeRogueShipId, isPlayerTurn);
        this.updatePlacementHighlight(time, isSetupPhase);
    }

    /**
     * Animates ship sinking descent and movement lerp for all ships on both boards.
     * - Sinking: gradual Y descent with tilt angles; mines are removed immediately.
     * - Broken ships: halves rotate apart during sink.
     * - Movement: smooth lerp toward targetPosition, snapping when close enough.
     */
    private updateShipAnimations(): void {
        const descentRate = 0.001 * Config.timing.gameSpeedMultiplier;
        const sinkFloor = Config.visual.sinkingFloor;
        const moveLerpFactor = 0.1 * Config.timing.gameSpeedMultiplier;

        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (!child.userData.isShip) return;

                // Sync sinking state from domain
                if (child.userData.ship.isSunk() && !child.userData.isSinking) {
                    child.userData.isSinking = true;
                    child.userData.sinkAngleZ = (Math.random() - 0.5) * 0.3;
                    child.userData.sinkAngleX = (Math.random() - 0.5) * 0.3;
                }

                if (child.userData.isSinking) {
                    // Rule: Mines disappear immediately, ships/sonars sink
                    if (child.userData.ship.specialType === 'mine') {
                        group.remove(child);
                        return;
                    }

                    if (child.position.y > sinkFloor) {
                        child.position.y -= descentRate;
                        const sinkProgress = Math.min(1.0, -child.position.y / Math.abs(sinkFloor));
                        child.rotation.z = sinkProgress * (child.userData.sinkAngleZ ?? 0.15);
                        child.rotation.x = sinkProgress * (child.userData.sinkAngleX ?? 0.08);

                        if (child.userData.isBroken && child.userData.halfA && child.userData.halfB) {
                            const breakAngle = sinkProgress * 0.4;
                            if (child.userData.shipOrientation === Orientation.Horizontal) {
                                child.userData.halfA.rotation.z = breakAngle;
                                child.userData.halfB.rotation.z = -breakAngle;
                            } else {
                                child.userData.halfA.rotation.x = -breakAngle;
                                child.userData.halfB.rotation.x = breakAngle;
                            }
                        }
                    }
                }

                if (child.userData.targetPosition) {
                    child.position.lerp(child.userData.targetPosition, moveLerpFactor);
                    if (child.position.distanceToSquared(child.userData.targetPosition) < 0.001) {
                        child.position.copy(child.userData.targetPosition);
                        child.userData.targetPosition = null;
                    }
                }
            });
        });
    }

    /**
     * Pulses emissive highlight on the active Rogue-mode ship.
     * Resets emissive to black on non-active ships.
     */
    private updateShipHighlighting(time: number, activeRogueShipId: string | null, isPlayerTurn: boolean): void {
        const shouldHighlight = Config.rogueMode && isPlayerTurn && activeRogueShipId;
        const currentIntensity = 0.2 + ((Math.sin(time * 5) + 1) / 2) * 0.6;
        const highlightColor = new THREE.Color(0xffff00), defaultColor = new THREE.Color(0x000000);

        this.playerBoardGroup.children.forEach(child => {
            if (child.userData.isShip) {
                const instancedMesh = child.userData.instancedMesh as THREE.InstancedMesh;
                if (instancedMesh?.material instanceof THREE.MeshStandardMaterial) {
                    if (shouldHighlight && child.userData.ship?.id === activeRogueShipId) {
                        instancedMesh.material.emissive.copy(highlightColor);
                        instancedMesh.material.emissiveIntensity = currentIntensity;
                    } else if (instancedMesh.material.emissiveIntensity > 0) {
                        instancedMesh.material.emissive.copy(defaultColor);
                        instancedMesh.material.emissiveIntensity = 0;
                    }
                }
            }
        });
    }

    /**
     * Shows/hides and animates the translucent placement zone highlight
     * during Rogue-mode setup phase.
     */
    private updatePlacementHighlight(time: number, isSetupPhase: boolean): void {
        if (!Config.rogueMode || !isSetupPhase) {
            if (this.placementHighlightMesh) this.placementHighlightMesh.visible = false;
            return;
        }

        if (!this.placementHighlightMesh) {
            const geo = new THREE.PlaneGeometry(6.9, 6.9);
            const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2, depthWrite: false });
            this.placementHighlightMesh = new THREE.Mesh(geo, mat);
            this.placementHighlightMesh.rotation.x = -Math.PI / 2;
            const offset = Config.board.width / 2;
            // Center of a 7x7 grid from (0,0) to (6,6) is (3,3).
            // In offset coords, 3 is at (3.5 - offset).
            this.placementHighlightMesh.position.set(3.5 - offset, 0.02, 3.5 - offset);
            this.playerBoardGroup.add(this.placementHighlightMesh);
        }

        this.placementHighlightMesh.visible = true;
        const currentIntensity = 0.1 + ((Math.sin(time * 5) + 1) / 2) * 0.2;
        (this.placementHighlightMesh.material as THREE.MeshBasicMaterial).opacity = currentIntensity;
    }
}
