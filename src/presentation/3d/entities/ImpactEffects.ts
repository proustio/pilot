import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { ParticleSystem } from './ParticleSystem';
import { Config } from '../../../infrastructure/config/Config';
import { SinkingEffects } from './SinkingEffects';
import type { AddRippleFn } from './SinkingEffects';

export type { AddRippleFn };

/**
 * Handles the visual aftermath of a projectile landing:
 * ship voxel destruction, explosions, persistent fire emitters.
 * Delegates sinking animation and hull splitting to SinkingEffects.
 *
 * Extracted from ProjectileManager to keep that class focused
 * on projectile creation and arc animation.
 */
export class ImpactEffects {
    private particleSystem: ParticleSystem;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;
    private sinkingEffects: SinkingEffects;

    constructor(
        particleSystem: ParticleSystem,
        playerBoardGroup: THREE.Group,
        enemyBoardGroup: THREE.Group
    ) {
        this.particleSystem = particleSystem;
        this.playerBoardGroup = playerBoardGroup;
        this.enemyBoardGroup = enemyBoardGroup;
        this.sinkingEffects = new SinkingEffects(particleSystem, playerBoardGroup, enemyBoardGroup);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public entry point
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Applies the visual impact of a shot (explosions, smoke, voxel destruction,
     * sinking, persistent fire).  Called for both live shots and replay.
     */
    public applyImpactEffects(
        cellX: number, cellZ: number, result: string,
        isPlayer: boolean, isReplay: boolean,
        addRipple: AddRippleFn
    ): void {
        const boardOffset = Config.board.width / 2;
        const worldX = cellX - boardOffset + 0.5;
        const worldZ = cellZ - boardOffset + 0.5;
        const isRogue = Config.rogueMode;
        const targetGroup = isRogue ? this.playerBoardGroup : (isPlayer ? this.enemyBoardGroup : this.playerBoardGroup);
        const impactPos = new THREE.Vector3(worldX, 0.4, worldZ);
        targetGroup.localToWorld(impactPos);

        if (!isReplay) {
            this.particleSystem.spawnExplosion(worldX, 0.4, worldZ, targetGroup);
        }

        let voxelsRemoved = 0;
        let shipFound: THREE.Object3D | null = null;

        for (const child of targetGroup.children) {
            if (child.userData.isShip && child.userData.instancedMesh && child.userData.coversCell(cellX, cellZ)) {
                shipFound = child;
                const im = child.userData.instancedMesh as THREE.InstancedMesh;
                const dummy = new THREE.Object3D();
                let updated = false;

                const destroyRatio = result === 'sunk' ? 0.85 : 0.25;
                const blastRadius = 0.65;

                for (let i = 0; i < im.count; i++) {
                    im.getMatrixAt(i, dummy.matrix);
                    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

                    if (dummy.scale.x > 0) {
                        const worldVoxelPos = dummy.position.clone();
                        child.localToWorld(worldVoxelPos);

                        if (worldVoxelPos.distanceTo(impactPos) < blastRadius) {
                            if (Math.random() < destroyRatio) {
                                dummy.scale.set(0, 0, 0);
                                dummy.updateMatrix();
                                im.setMatrixAt(i, dummy.matrix);
                                updated = true;
                                voxelsRemoved++;
                            }
                        } else if (result === 'sunk') {
                            if (Math.random() < 0.45) { // Damage the rest of the ship heavily
                                dummy.scale.set(0, 0, 0);
                                dummy.updateMatrix();
                                im.setMatrixAt(i, dummy.matrix);
                                updated = true;
                                voxelsRemoved++;
                            }
                        }
                    }
                }

                if (updated) {
                    im.instanceMatrix.needsUpdate = true;
                }

                if (result === 'sunk') {
                    this.sinkingEffects.handleSinking(
                        child, cellX, cellZ, boardOffset, isReplay, isPlayer, addRipple,
                        this.addPersistentFireToShipCell.bind(this)
                    );
                }
            }
        }

        if (result === 'hit' || result === 'sunk') {
            const ship = shipFound?.userData?.ship as Ship | undefined;
            let intensity = 1.0;
            let shipId = ship?.id || 'unknown';

            if (ship) {
                const hitCount = ship.segments.filter((s: boolean) => !s).length;
                intensity = 0.5 + (hitCount - 1) * 0.4;
                if (isRogue) intensity *= 1.5; // More dramatic fire in Rogue mode
            }

            const shouldAttachToShip = shipFound && (Config.rogueMode || (ship && ship.isSunk()));

            if (shouldAttachToShip) {
                // Rogue mode or sunk: attach fire to the ship so it moves/leans with it
                const smokeColor = (isRogue || result === 'sunk')
                    ? this.particleSystem.blackSmokeMat.color.getStyle()
                    : this.particleSystem.greySmokeMat.color.getStyle();
                this.addPersistentFireToShipCell(shipFound as THREE.Group, cellX, cellZ, boardOffset, intensity, smokeColor);
            } else {
                // Classic hit on hidden ship: attach fire to the board group so it's visible
                this.particleSystem.addEmitter(
                    worldX, 0.4, worldZ,
                    true, targetGroup,
                    result === 'sunk' ? this.particleSystem.blackSmokeMat.color.getStyle() : this.particleSystem.greySmokeMat.color.getStyle(),
                    intensity,
                    `ship-flame-${shipId}-${cellX}-${cellZ}`
                );
            }
        }

        if (voxelsRemoved > 0 && !isReplay) {
            this.particleSystem.spawnVoxelExplosion(worldX, 0.4, worldZ, voxelsRemoved, targetGroup);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Persistent fire helper
    // ─────────────────────────────────────────────────────────────────────────

    private addPersistentFireToShipCell(
        shipGroup: THREE.Group,
        cellX: number, cellZ: number,
        boardOffset: number,
        intensity: number = 1.0,
        color?: string
    ): void {
        const smokeColor = color || this.particleSystem.greySmokeMat.color.getStyle();
        const targetWorldX = cellX - boardOffset + 0.5;
        const targetWorldZ = cellZ - boardOffset + 0.5;

        let targetFireGroup: THREE.Object3D = shipGroup;

        if (shipGroup.userData.isBroken && shipGroup.userData.halfA && shipGroup.userData.halfB) {
            const isHorizontal = shipGroup.userData.shipOrientation === Orientation.Horizontal;
            const pivot = shipGroup.userData.pivotPos;
            const currentPos = new THREE.Vector2(
                targetWorldX - shipGroup.position.x,
                targetWorldZ - shipGroup.position.z
            );

            const isPartA = isHorizontal ? currentPos.x < pivot.x : currentPos.y < pivot.z;
            targetFireGroup = isPartA ? shipGroup.userData.halfA : shipGroup.userData.halfB;
        }

        // Use worldToLocal to handle ship rotation and board position correctly
        const boardGroup = shipGroup.parent || this.playerBoardGroup;
        const worldPos = new THREE.Vector3(targetWorldX, 0.4, targetWorldZ);
        boardGroup.localToWorld(worldPos);
        targetFireGroup.worldToLocal(worldPos);

        const shipId = shipGroup.userData.ship?.id || 'unknown';
        this.particleSystem.addEmitter(
            worldPos.x, worldPos.y, worldPos.z,
            true, targetFireGroup,
            smokeColor,
            intensity,
            `ship-flame-${shipId}-${cellX}-${cellZ}-ship`
        );
    }
}
