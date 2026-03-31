import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem';
import { FogManager } from './FogManager';
import { ImpactEffects } from './ImpactEffects';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';

export interface FallingMarker {
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
 * Handles per-frame arc animation, landing resolution, fog clearing,
 * and sound triggers for in-flight projectiles.
 *
 * Extracted from ProjectileManager to keep that class focused on
 * projectile/missile creation, replay placement, and marker management.
 */
export class ProjectileAnimator {
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
        enemyBoardGroup: THREE.Group,
        impactEffects: ImpactEffects
    ) {
        this.particleSystem = particleSystem;
        this.fogManager = fogManager;
        this.playerBoardGroup = playerBoardGroup;
        this.enemyBoardGroup = enemyBoardGroup;
        this.impactEffects = impactEffects;
    }

    /** Add a marker to the in-flight queue (called by ProjectileManager). */
    public addFallingMarker(marker: FallingMarker): void {
        this.fallingMarkers.push(marker);
    }

    /** Whether any projectiles are still in flight. */
    public hasFalling(): boolean {
        return this.fallingMarkers.length > 0;
    }

    /** Remove all in-flight markers from the scene and clear the queue. */
    public clearAll(): void {
        this.fallingMarkers.forEach(m => m.mesh.parent?.remove(m.mesh));
        this.fallingMarkers = [];
    }

    /**
     * Per-frame update: advance each projectile along its bezier arc,
     * resolve landing (impact effects, fog clearing, sound), and remove
     * completed markers from the queue.
     */
    public updateProjectiles(
        addRipple: (worldX: number, worldZ: number, isPlayerBoard: boolean) => void,
        playerWaterUniforms: any,
        enemyWaterUniforms: any
    ): void {
        for (let i = this.fallingMarkers.length - 1; i >= 0; i--) {
            const m = this.fallingMarkers[i];
            m.progress += Config.timing.projectileSpeed * Config.timing.gameSpeedMultiplier;

            if (m.progress >= 1.0) {
                this.resolveLanding(m, addRipple, playerWaterUniforms, enemyWaterUniforms);
                this.fallingMarkers.splice(i, 1);
            } else {
                m.mesh.position.copy(m.curve.getPoint(m.progress));
                const tangent = m.curve.getTangent(m.progress);
                m.mesh.lookAt(m.mesh.position.clone().add(tangent));
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Landing resolution (private)
    // ─────────────────────────────────────────────────────────────────────────

    private resolveLanding(
        m: FallingMarker,
        addRipple: (worldX: number, worldZ: number, isPlayerBoard: boolean) => void,
        playerWaterUniforms: any,
        enemyWaterUniforms: any
    ): void {
        m.progress = 1.0;
        const finalPos = m.curve.getPoint(1.0);
        m.mesh.position.copy(finalPos);

        this.destroyMissileVoxels(m);

        const isRogue = Config.rogueMode;
        const targetGroup = isRogue
            ? this.playerBoardGroup
            : (m.isPlayer ? this.enemyBoardGroup : this.playerBoardGroup);

        // Water splash + ripple
        // Particle pool meshes live in playerBoardGroup, so convert coords when targeting enemy board
        let splashX = m.worldX, splashY = 0.2, splashZ = m.worldZ;
        if (targetGroup !== this.playerBoardGroup) {
            const sp = new THREE.Vector3(m.worldX, 0.2, m.worldZ);
            targetGroup.localToWorld(sp);
            this.playerBoardGroup.worldToLocal(sp);
            splashX = sp.x; splashY = sp.y; splashZ = sp.z;
        }
        this.particleSystem.spawnSplash(splashX, splashY, splashZ, targetGroup);
        const rippleOnPlayerBoard = Config.rogueMode ? false : !m.isPlayer;
        addRipple(m.worldX, m.worldZ, rippleOnPlayerBoard);

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

        // Impact effects for hits/sinks
        if (m.result === 'hit' || m.result === 'sunk') {
            this.impactEffects.applyImpactEffects(m.cellX, m.cellZ, m.result, m.isPlayer, false, addRipple);

            if (isRogue) {
                // Reparent marker to the ship so it moves with it
                const shipMesh = targetGroup.children.find(
                    c => c.userData.isShip && c.userData.coversCell(m.cellX, m.cellZ)
                );
                if (shipMesh) {
                    const worldPos = new THREE.Vector3();
                    m.mesh.getWorldPosition(worldPos);
                    shipMesh.add(m.mesh);
                    shipMesh.worldToLocal(worldPos);
                    m.mesh.position.copy(worldPos);
                }
            }
        } else {
            // Miss: sink into water partially
            m.mesh.position.y = -0.15;
            m.mesh.rotation.set(0, 0, 0);
            m.mesh.rotation.x = (Math.random() - 0.5) * 0.5;
            m.mesh.rotation.z = (Math.random() - 0.5) * 0.5;
        }

        // Sound triggers
        if (!m.isReplayFlag) {
            if (m.result === 'miss') {
                AudioEngine.getInstance().playSplash();
            } else if (m.result === 'hit') {
                AudioEngine.getInstance().playHit();
            } else if (m.result === 'sunk') {
                AudioEngine.getInstance().playKill();
            }
        }
    }

    private destroyMissileVoxels(m: FallingMarker): void {
        if (!m.mesh.userData.instancedMesh) return;

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
            // Particle pool meshes live in playerBoardGroup — convert coords when targeting enemy board
            let vx = m.worldX, vy = 0.4, vz = m.worldZ;
            if (tg !== this.playerBoardGroup) {
                const vp = new THREE.Vector3(m.worldX, 0.4, m.worldZ);
                tg.localToWorld(vp);
                this.playerBoardGroup.worldToLocal(vp);
                vx = vp.x; vy = vp.y; vz = vp.z;
            }
            this.particleSystem.spawnVoxelExplosion(vx, vy, vz, destroyedCount, tg);
        }
    }
}
