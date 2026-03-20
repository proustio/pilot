import * as THREE from 'three';
import { Orientation } from '../../../domain/fleet/Ship';
import { ParticleSystem } from './ParticleSystem';
import { FogManager } from './FogManager';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';

interface FallingMarker {
    mesh: THREE.Object3D;
    curve: THREE.QuadraticBezierCurve3;
    progress: number;
    worldX: number;
    worldZ: number;
    result: string;
    isPlayer: boolean;
    cellX: number;
    cellZ: number;
    isReplayFlag: boolean;
}

/**
 * Manages projectile (attack marker) creation, arc animation,
 * impact effects, ship breaking, and persistent fire.
 */
export class ProjectileManager {
    private fallingMarkers: FallingMarker[] = [];
    private particleSystem: ParticleSystem;
    private fogManager: FogManager;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    constructor(
        particleSystem: ParticleSystem,
        fogManager: FogManager,
        playerBoardGroup: THREE.Group,
        enemyBoardGroup: THREE.Group
    ) {
        this.particleSystem = particleSystem;
        this.fogManager = fogManager;
        this.playerBoardGroup = playerBoardGroup;
        this.enemyBoardGroup = enemyBoardGroup;
    }

    public hasFallingMarkers(): boolean {
        return this.fallingMarkers.length > 0;
    }

    /**
     * Creates a missile marker, either placing it instantly (replay) or
     * setting up a bezier-curve arc animation.
     */
    public addAttackMarker(
        x: number, z: number, result: string,
        isPlayer: boolean, isReplay: boolean,
        addRipple: (worldX: number, worldZ: number, isPlayerBoard: boolean) => void
    ) {
        if (!isReplay) {
            AudioEngine.getInstance().playShoot();
        }

        const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

        // ───── Missile Material ─────
        const activeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.2,
            metalness: 0.8,
            vertexColors: true
        });
        const activeGlowColor = result === 'hit' || result === 'sunk' ? 0xFF2400 : 0x4169E1;
        activeMat.emissive.setHex(activeGlowColor);
        activeMat.emissiveIntensity = 2.0;

        const marker = new THREE.Group();
        marker.userData = { originalMat: activeMat, isAttackMarker: true };

        const rocketModel = new THREE.Group();
        rocketModel.rotation.x = 25 * Math.PI / 180;
        marker.add(rocketModel);

        // ───── Missile Voxel Model ─────
        const voxelSize = 0.05;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        const voxels: THREE.Vector3[] = [];

        for (let mx = -1; mx <= 1; mx++) {
            for (let my = -1; my <= 1; my++) {
                if (Math.abs(mx) === 1 && Math.abs(my) === 1) continue;
                for (let mz = 0; mz < 8; mz++) {
                    voxels.push(new THREE.Vector3(mx * voxelSize, my * voxelSize, mz * voxelSize));
                }
            }
        }

        voxels.push(new THREE.Vector3(0, voxelSize, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, -voxelSize, 8 * voxelSize));
        voxels.push(new THREE.Vector3(voxelSize, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(-voxelSize, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, 0, 9 * voxelSize));

        for (let mz = 0; mz < 3; mz++) {
            voxels.push(new THREE.Vector3(2 * voxelSize, 0, mz * voxelSize));
            voxels.push(new THREE.Vector3(-2 * voxelSize, 0, mz * voxelSize));
            voxels.push(new THREE.Vector3(0, 2 * voxelSize, mz * voxelSize));
            voxels.push(new THREE.Vector3(0, -2 * voxelSize, mz * voxelSize));
        }

        const instancedMissile = new THREE.InstancedMesh(voxelGeo, activeMat, voxels.length);
        instancedMissile.castShadow = true;

        const dummy = new THREE.Object3D();
        const white = new THREE.Color(0xffffff);
        const black = new THREE.Color(0x222222);

        voxels.forEach((pos, i) => {
            dummy.position.copy(pos);
            dummy.updateMatrix();
            instancedMissile.setMatrixAt(i, dummy.matrix);
            const zIndex = Math.round(pos.z / voxelSize);
            const isBlackStripe = zIndex % 2 === 0;
            instancedMissile.setColorAt(i, isBlackStripe ? black : white);
        });

        rocketModel.add(instancedMissile);
        marker.userData.instancedMesh = instancedMissile;

        const boardOffset = Config.board.width / 2;
        const worldX = x - boardOffset + 0.5;
        const worldZ = z - boardOffset + 0.5;
        const targetLocalPos = new THREE.Vector3(worldX, 0.4, worldZ);

        // ───── Replay (instant placement) ─────
        if (isReplay) {
            if (marker.userData.instancedMesh) {
                const im = marker.userData.instancedMesh as THREE.InstancedMesh;
                const finalMat = marker.userData.originalMat.clone();
                finalMat.emissive.setHex(0x000000);
                im.material = finalMat;

                const destroyRatio = result === 'hit' || result === 'sunk' ? 0.60 : 0.30;
                const dummyR = new THREE.Object3D();
                for (let j = 0; j < im.count; j++) {
                    if (Math.random() < destroyRatio) {
                        im.getMatrixAt(j, dummyR.matrix);
                        dummyR.matrix.decompose(dummyR.position, dummyR.quaternion, dummyR.scale);
                        dummyR.scale.set(0, 0, 0);
                        dummyR.updateMatrix();
                        im.setMatrixAt(j, dummyR.matrix);
                    }
                }
                im.instanceMatrix.needsUpdate = true;
            }
            marker.position.set(worldX, 0.4, worldZ);
            if (isPlayer) {
                this.fogManager.clearFogCell(x, z);
            }
            targetGroup.add(marker);

            if (result === 'hit' || result === 'sunk') {
                this.applyImpactEffects(x, z, result, isPlayer, true, addRipple);
            }
            return;
        }

        // ───── Live Shot Arc ─────
        const sourceGroup = isPlayer ? this.playerBoardGroup : this.enemyBoardGroup;
        let startPos = new THREE.Vector3((Math.random() - 0.5) * 10, 5, (Math.random() - 0.5) * 10);

        const friendlyShips: THREE.Group[] = [];
        sourceGroup.children.forEach((c: THREE.Object3D) => {
            if (c.userData.isShip && !c.userData.isSinking) friendlyShips.push(c as THREE.Group);
        });

        if (friendlyShips.length > 0) {
            const randomShip = friendlyShips[Math.floor(Math.random() * friendlyShips.length)];
            randomShip.getWorldPosition(startPos);
            targetGroup.worldToLocal(startPos);
        } else {
            startPos.set(0, 10, 0);
        }

        const midPoint = new THREE.Vector3().addVectors(startPos, targetLocalPos).multiplyScalar(0.5);
        midPoint.y += 5.0;

        const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, targetLocalPos);

        marker.position.copy(startPos);
        targetGroup.add(marker);

        this.fallingMarkers.push({
            mesh: marker,
            curve,
            progress: 0,
            worldX,
            worldZ,
            result,
            isPlayer,
            cellX: x,
            cellZ: z,
            isReplayFlag: isReplay
        });
    }

    /**
     * Update loop for projectile arcs — called each frame from EntityManager.
     */
    public updateProjectiles(
        addRipple: (worldX: number, worldZ: number, isPlayerBoard: boolean) => void,
        playerWaterUniforms: any,
        enemyWaterUniforms: any
    ) {
        for (let i = this.fallingMarkers.length - 1; i >= 0; i--) {
            const m = this.fallingMarkers[i];
            m.progress += Config.timing.projectileSpeed * Config.timing.gameSpeedMultiplier;

            if (m.progress >= 1.0) {
                m.progress = 1.0;
                const finalPos = m.curve.getPoint(1.0);
                m.mesh.position.copy(finalPos);

                // Apply original material, kill glow on hit
                if (m.mesh.userData.instancedMesh) {
                    const im = m.mesh.userData.instancedMesh as THREE.InstancedMesh;
                    const finalMat = m.mesh.userData.originalMat.clone();
                    finalMat.emissive.setHex(0x000000);
                    im.material = finalMat;

                    const destroyRatio = m.result === 'hit' || m.result === 'sunk' ? 0.60 : 0.30;
                    const dummy = new THREE.Object3D();
                    let destroyedCount = 0;

                    for (let j = 0; j < im.count; j++) {
                        if (Math.random() < destroyRatio) {
                            im.getMatrixAt(j, dummy.matrix);
                            dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                            dummy.scale.set(0, 0, 0);
                            dummy.updateMatrix();
                            im.setMatrixAt(j, dummy.matrix);
                            destroyedCount++;
                        }
                    }
                    im.instanceMatrix.needsUpdate = true;

                    if (destroyedCount > 0) {
                        const tg = m.isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;
                        this.particleSystem.spawnVoxelExplosion(m.worldX, 0.4, m.worldZ, destroyedCount, tg);
                    }
                }

                const targetGroup = m.isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

                // Water splash + ripple
                this.particleSystem.spawnSplash(m.worldX, 0.2, m.worldZ, targetGroup);
                addRipple(m.worldX, m.worldZ, !m.isPlayer);

                // Sunk-ship turbulence
                if (m.result === 'sunk') {
                    const targetUniforms = m.isPlayer ? enemyWaterUniforms : playerWaterUniforms;
                    if (targetUniforms) {
                        targetUniforms.globalTurbulence.value = 0.4;
                    }
                }

                // Clear fog
                if (m.isPlayer) {
                    const fogIdx = getIndex(m.cellX, m.cellZ, Config.board.width);
                    this.fogManager.clearFogByIndex(fogIdx);
                }

                if (m.result === 'hit' || m.result === 'sunk') {
                    this.applyImpactEffects(m.cellX, m.cellZ, m.result, m.isPlayer, false, addRipple);
                } else {
                    // Miss: sink into water partially
                    m.mesh.position.y = -0.15;
                    m.mesh.rotation.set(0, 0, 0);
                    m.mesh.rotation.x = (Math.random() - 0.5) * 0.5;
                    m.mesh.rotation.z = (Math.random() - 0.5) * 0.5;
                }

                if (!m.isReplayFlag) {
                    if (m.result === 'miss') {
                        AudioEngine.getInstance().playSplash();
                    } else if (m.result === 'hit') {
                        AudioEngine.getInstance().playHit();
                    } else if (m.result === 'sunk') {
                        AudioEngine.getInstance().playKill();
                    }
                }

                this.fallingMarkers.splice(i, 1);
            } else {
                m.mesh.position.copy(m.curve.getPoint(m.progress));
                const tangent = m.curve.getTangent(m.progress);
                m.mesh.lookAt(m.mesh.position.clone().add(tangent));
            }
        }
    }

    /**
     * Applies the visual impact of a shot (explosions, smoke, voxel destruction).
     * Can be called for live shots or during replay (load/refresh).
     */
    private applyImpactEffects(
        cellX: number, cellZ: number, result: string,
        isPlayer: boolean, isReplay: boolean,
        addRipple: (worldX: number, worldZ: number, isPlayerBoard: boolean) => void
    ) {
        const boardOffset = Config.board.width / 2;
        const worldX = cellX - boardOffset + 0.5;
        const worldZ = cellZ - boardOffset + 0.5;
        const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;
        const impactPos = new THREE.Vector3(worldX, 0.4, worldZ);

        if (!isReplay) {
            this.particleSystem.spawnExplosion(worldX, 0.4, worldZ, targetGroup);
        }

        let voxelsRemoved = 0;
        let shipFound: THREE.Object3D | null = null;

        targetGroup.children.forEach((child: THREE.Object3D) => {
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
                        }
                    }
                }

                if (updated) {
                    im.instanceMatrix.needsUpdate = true;
                }

                // Handle Sinking
                if (result === 'sunk') {
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
                            this.addPersistentFireToShipCell(shipGroup, sx, sz, boardOffset);
                        }
                    } else {
                        for (let s = 0; s < shipLength; s++) {
                            const delay = s * 0.2 + (Math.random() * 0.1);
                            const sx = minX + (isHorizontal ? s : 0);
                            const sz = minZ + (!isHorizontal ? s : 0);

                            const ex = sx - boardOffset + 0.5;
                            const ez = sz - boardOffset + 0.5;

                            setTimeout(() => {
                                this.particleSystem.spawnExplosion(ex, 0.4, ez, targetGroup);
                                this.particleSystem.spawnVoxelExplosion(ex, 0.4, ez, 10, targetGroup);
                                addRipple(ex, ez, !isPlayer);

                                this.addPersistentFireToShipCell(shipGroup, sx, sz, boardOffset);
                            }, delay * 1000);
                        }
                    }
                } else if (result === 'hit') {
                    this.addPersistentFireToShipCell(child as THREE.Group, cellX, cellZ, boardOffset);
                }
            }
        });

        if (!shipFound && (result === 'hit' || result === 'sunk')) {
            this.particleSystem.addEmitter(worldX, 0.4, worldZ, false, targetGroup, true);
        }

        if (voxelsRemoved > 0 && !isReplay) {
            this.particleSystem.spawnVoxelExplosion(worldX, 0.4, worldZ, voxelsRemoved, targetGroup);
        }
    }

    private addPersistentFireToShipCell(shipGroup: THREE.Group, cellX: number, cellZ: number, boardOffset: number) {
        const targetWorldX = cellX - boardOffset + 0.5;
        const targetWorldZ = cellZ - boardOffset + 0.5;

        let targetFireGroup: THREE.Object3D = shipGroup;

        if (shipGroup.userData.isBroken && shipGroup.userData.halfA && shipGroup.userData.halfB) {
            const isHorizontal = shipGroup.userData.shipOrientation === Orientation.Horizontal;
            const pivot = shipGroup.userData.pivotPos;
            const currentPos = new THREE.Vector2(targetWorldX - shipGroup.position.x, targetWorldZ - shipGroup.position.z);

            const isPartA = isHorizontal ? currentPos.x < pivot.x : currentPos.y < pivot.z;
            targetFireGroup = isPartA ? shipGroup.userData.halfA : shipGroup.userData.halfB;
        }

        const lX = targetWorldX - shipGroup.position.x - (targetFireGroup === shipGroup ? 0 : shipGroup.userData.pivotPos.x);
        const lZ = targetWorldZ - shipGroup.position.z - (targetFireGroup === shipGroup ? 0 : shipGroup.userData.pivotPos.z);
        this.particleSystem.addEmitter(lX, 0.4, lZ, true, targetFireGroup);
    }

    private splitShipForBreaking(shipGroup: THREE.Group, pivotCellX: number, pivotCellZ: number) {
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
