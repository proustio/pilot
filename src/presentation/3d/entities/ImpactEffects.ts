import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { ParticleSystem } from './ParticleSystem';
import { Config } from '../../../infrastructure/config/Config';

export type AddRippleFn = (worldX: number, worldZ: number, isPlayerBoard: boolean) => void;

/**
 * Handles the visual aftermath of a projectile landing:
 * ship voxel destruction, explosions, sinking animation,
 * persistent fire emitters, and the ship-breaking split.
 *
 * Extracted from ProjectileManager to keep that class focused
 * on projectile creation and arc animation.
 */
export class ImpactEffects {
    private particleSystem: ParticleSystem;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    constructor(
        particleSystem: ParticleSystem,
        playerBoardGroup: THREE.Group,
        enemyBoardGroup: THREE.Group
    ) {
        this.particleSystem = particleSystem;
        this.playerBoardGroup = playerBoardGroup;
        this.enemyBoardGroup = enemyBoardGroup;
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
                    this.handleSinking(child, cellX, cellZ, boardOffset, isReplay, isPlayer, addRipple);
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
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    private handleSinking(
        child: THREE.Object3D,
        cellX: number, cellZ: number,
        boardOffset: number,
        isReplay: boolean,
        isPlayer: boolean,
        addRipple: AddRippleFn
    ): void {
        const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

        if (!child.userData.isSinking) {
            child.userData.isSinking = true;

            const maxLean = Config.visual.sinkingMaxAngle;
            child.userData.sinkAngleX = (Math.random() - 0.5) * maxLean * 2;
            child.userData.sinkAngleZ = (Math.random() - 0.5) * maxLean * 2;

            this.splitShipForBreaking(child as THREE.Group, cellX, cellZ);
        }

        child.visible = true;

        const shipGroup = child as THREE.Group;
        const isHorizontal = shipGroup.userData.shipOrientation === Orientation.Horizontal;

        let minX = cellX, maxX = cellX, minZ = cellZ, maxZ = cellZ;
        for (let dx = -5; dx <= 5; dx++) {
            if (shipGroup.userData.coversCell(cellX + dx, cellZ)) {
                minX = Math.min(minX, cellX + dx);
                maxX = Math.max(maxX, cellX + dx);
            }
        }
        for (let dz = -5; dz <= 5; dz++) {
            if (shipGroup.userData.coversCell(cellX, cellZ + dz)) {
                minZ = Math.min(minZ, cellZ + dz);
                maxZ = Math.max(maxZ, cellZ + dz);
            }
        }

        const shipLength = Math.max(maxX - minX, maxZ - minZ) + 1;

        if (isReplay) {
            child.position.y = Config.visual.sinkingFloor;
            child.rotation.z = child.userData.sinkAngleZ;
            child.rotation.x = child.userData.sinkAngleX;

            for (let s = 0; s < shipLength; s++) {
                const sx = minX + (isHorizontal ? s : 0);
                const sz = minZ + (!isHorizontal ? s : 0);
                // Sunk ships burn at max intensity (2.0) with black smoke
                this.addPersistentFireToShipCell(shipGroup, sx, sz, boardOffset, 2.0, this.particleSystem.blackSmokeMat.color.getStyle());
            }
        } else {
            for (let s = 0; s < shipLength; s++) {
                const delay = s * 0.2 + (Math.random() * 0.1);
                const sx = minX + (isHorizontal ? s : 0);
                const sz = minZ + (!isHorizontal ? s : 0);

                const ex = sx - boardOffset + 0.5;
                const ez = sz - boardOffset + 0.5;

                const speed = Config.timing.gameSpeedMultiplier;
                setTimeout(() => {
                    this.particleSystem.spawnExplosion(ex, 0.4, ez, targetGroup);
                    this.particleSystem.spawnVoxelExplosion(ex, 0.4, ez, 10, targetGroup);
                    const rippleOnPlayerBoard = Config.rogueMode ? false : !isPlayer;
                    addRipple(ex, ez, rippleOnPlayerBoard);
                    this.addPersistentFireToShipCell(shipGroup, sx, sz, boardOffset, 2.0, this.particleSystem.blackSmokeMat.color.getStyle());
                }, (delay * 1000) / speed);
            }
        }
    }

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

    private splitShipForBreaking(shipGroup: THREE.Group, pivotCellX: number, pivotCellZ: number): void {
        if (shipGroup.userData.isBroken) return;
        shipGroup.userData.isBroken = true;

        const boardOffset = Config.board.width / 2;
        const px = pivotCellX - boardOffset + 0.5 - shipGroup.position.x;
        const pz = pivotCellZ - boardOffset + 0.5 - shipGroup.position.z;
        const pivotPos = new THREE.Vector3(px, 0, pz);
        shipGroup.userData.pivotPos = pivotPos;

        const halfA = new THREE.Group();
        const halfB = new THREE.Group();
        halfA.position.copy(pivotPos);
        halfB.position.copy(pivotPos);

        shipGroup.add(halfA);
        shipGroup.add(halfB);
        shipGroup.userData.halfA = halfA;
        shipGroup.userData.halfB = halfB;

        const isHorizontal = shipGroup.userData.shipOrientation === Orientation.Horizontal;

        const children = [...shipGroup.children];
        children.forEach(child => {
            if (child === halfA || child === halfB) return;

            if (child instanceof THREE.InstancedMesh) {
                const imA = child.clone();
                const imB = child.clone();

                imA.position.sub(pivotPos);
                imB.position.sub(pivotPos);

                halfA.add(imA);
                halfB.add(imB);

                const dummy = new THREE.Object3D();
                for (let i = 0; i < child.count; i++) {
                    child.getMatrixAt(i, dummy.matrix);
                    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

                    const voxelLocalX = dummy.position.x + child.position.x;
                    const voxelLocalZ = dummy.position.z + child.position.z;
                    const isPartA = isHorizontal ? voxelLocalX < px : voxelLocalZ < pz;

                    if (isPartA) {
                        dummy.scale.set(0, 0, 0);
                        dummy.updateMatrix();
                        imB.setMatrixAt(i, dummy.matrix);
                    } else {
                        dummy.scale.set(0, 0, 0);
                        dummy.updateMatrix();
                        imA.setMatrixAt(i, dummy.matrix);
                    }
                }
                imA.instanceMatrix.needsUpdate = true;
                imB.instanceMatrix.needsUpdate = true;
                shipGroup.remove(child);
            } else {
                const isPartA = isHorizontal ? child.position.x < px : child.position.z < pz;
                child.position.sub(pivotPos);
                if (isPartA) halfA.add(child);
                else halfB.add(child);
            }
        });
    }
}
