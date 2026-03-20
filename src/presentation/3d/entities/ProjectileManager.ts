import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem';
import { FogManager } from './FogManager';
import { ImpactEffects } from './ImpactEffects';
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
    private impactEffects: ImpactEffects;

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
        this.impactEffects = new ImpactEffects(particleSystem, playerBoardGroup, enemyBoardGroup);
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
                this.impactEffects.applyImpactEffects(x, z, result, isPlayer, true, addRipple);
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
                    this.impactEffects.applyImpactEffects(m.cellX, m.cellZ, m.result, m.isPlayer, false, addRipple);
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

}
