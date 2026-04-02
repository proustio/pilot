import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { EmitterManager, EmitterSpawnCallback } from './EmitterManager';
import { ParticlePoolType, InstancedParticle, _tempMatrix, _tempQuaternion, _tempScale, _tempColor, _tempPos } from './ParticleTypes';
import { ParticlePoolManager } from './ParticlePoolManager';
import { ParticleSpawner } from './ParticleSpawner';

export class ParticleSystem {
    private particles: InstancedParticle[] = [];
    private emitterManager = new EmitterManager();
    public poolManager = new ParticlePoolManager();
    public spawner = new ParticleSpawner(this.poolManager, this.particles);

    /** External spawn-rate throttle (0.0–1.0), set by EntityManager draw call budget */
    public spawnRateScale = 1.0;

    // Materials re-exported to maintain backwards compatibility
    public get fireMat() { return this.poolManager.fireMat; }
    public get secondaryFireMat() { return this.poolManager.secondaryFireMat; }
    public get greySmokeMat() { return this.poolManager.greySmokeMat; }
    public get blackSmokeMat() { return this.poolManager.blackSmokeMat; }

    // ── Pool initialization ──────────────────────────────────────

    public initPools(parentGroup: THREE.Object3D): void {
        this.poolManager.initPools(parentGroup);
    }

    // ── Spawn methods ────────────────────────────────────────────

    public hasActiveParticles(): boolean {
        return this.particles.some(p => !p.isSmoke && !p.isFire);
    }

    public getEmitterStats(): { emitterCount: number; throttleFactor: number } {
        return this.emitterManager.getStats();
    }

    public spawnFire(x: number, y: number, z: number, group: THREE.Object3D, intensity: number = 1.0): void {
        this.spawner.spawnFire(x, y, z, group, intensity, this.spawnRateScale);
    }

    public spawnSmoke(x: number, y: number, z: number, color: string, group: THREE.Object3D, intensity: number = 1.0): void {
        this.spawner.spawnSmoke(x, y, z, color, group, intensity, this.spawnRateScale);
    }

    public spawnExplosion(x: number, y: number, z: number, group: THREE.Object3D): void {
        this.spawner.spawnExplosion(x, y, z, group, this.spawnRateScale);
    }

    public spawnSplash(x: number, y: number, z: number, group: THREE.Object3D): void {
        this.spawner.spawnSplash(x, y, z, group, this.spawnRateScale);
    }

    public spawnVoxelExplosion(x: number, y: number, z: number, count: number, group: THREE.Object3D): void {
        this.spawner.spawnVoxelExplosion(x, y, z, count, group, this.spawnRateScale);
    }

    public spawnFog(x: number, y: number, z: number, group: THREE.Object3D): void {
        this.spawner.spawnFog(x, y, z, group);
    }

    // ── Emitter delegation (unchanged public API) ───────────────────────────

    public addEmitter(x: number, y: number, z: number, hasFire: boolean, group: THREE.Object3D, color?: string, intensity: number = 1.0, id?: string): void {
        const emitterColor = color || this.poolManager.blackSmokeMat.color.getStyle();
        this.emitterManager.addEmitter(x, y, z, hasFire, group, emitterColor, intensity, id);
    }

    public updateEmittersByIdPrefix(prefix: string, intensity: number): void {
        this.emitterManager.updateEmittersByIdPrefix(prefix, intensity);
    }

    // ── Update loop ──────────────────────────────────────────────

    public update(): void {
        // Delegate emitter spawn scheduling
        this.emitterManager.updateEmitters(this as unknown as EmitterSpawnCallback);

        const speed = Config.timing.gameSpeedMultiplier;
        const poolsWithActivity = new Set<ParticlePoolType>();

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Apply velocity
            p.position.addScaledVector(p.velocity, speed);

            if (p.isSmoke) {
                // Smoke expands, drifts, fades
                p.scale += 0.005 * speed;
                p.velocity.x += (Math.random() - 0.5) * 0.001 * speed;
                p.velocity.z += (Math.random() - 0.5) * 0.001 * speed;
                p.opacity = (p.life / p.maxLife) * 0.8;
            } else if (p.isFire) {
                // Fire shrinks and flickers
                p.scale *= Math.pow(0.96, speed);
                p.velocity.x += (Math.random() - 0.5) * 0.005 * speed;
                p.velocity.z += (Math.random() - 0.5) * 0.005 * speed;
            } else if (p.poolType !== 'fog') {
                // Gravity for explosion/splash
                p.velocity.y -= 0.005 * speed;
            }

            // Rotation
            p.rotation.x += 0.05 * speed;
            p.rotation.y += 0.05 * speed;

            p.life -= 0.016 * speed;

            // Scale down at end of life
            if (p.life < p.maxLife * 0.3 && p.poolType !== 'fog') {
                p.scale *= 0.9;
            }

            // Check expiry
            // For particles on non-poolParent groups, check Y in pool-parent space
            let checkY = p.position.y;
            if (p.group !== this.poolManager.poolParent && this.poolManager.poolParent) {
                _tempPos.copy(p.position);
                p.group.localToWorld(_tempPos);
                this.poolManager.poolParent.worldToLocal(_tempPos);
                checkY = _tempPos.y;
            }
            if (p.life <= 0 || checkY < -3) {
                const pool = this.poolManager.pools.get(p.poolType)!;
                this.poolManager.releaseSlot(pool, p.slotIndex);

                // Swap-and-pop
                const lastIdx = this.particles.length - 1;
                if (i !== lastIdx) {
                    this.particles[i] = this.particles[lastIdx];
                    const movedP = this.particles[i];
                    const movedPool = this.poolManager.pools.get(movedP.poolType)!;
                    movedPool.slotToParticleIndex.set(movedP.slotIndex, i);
                }
                this.particles.pop();
                poolsWithActivity.add(p.poolType);
                continue;
            }

            // Write instance matrix
            // p.position is in the particle's group local space.
            // Pool meshes live under poolParent (playerBoardGroup), so we must
            // transform from group-local → world → poolParent-local.
            const pool = this.poolManager.pools.get(p.poolType)!;
            _tempPos.copy(p.position);
            if (p.group !== this.poolManager.poolParent && this.poolManager.poolParent) {
                p.group.localToWorld(_tempPos);
                this.poolManager.poolParent.worldToLocal(_tempPos);
            }
            _tempQuaternion.setFromEuler(p.rotation);
            _tempScale.setScalar(p.scale);
            _tempMatrix.compose(_tempPos, _tempQuaternion, _tempScale);
            pool.mesh.setMatrixAt(p.slotIndex, _tempMatrix);

            // Write per-instance color for types that need it
            if (p.isSmoke) {
                // Modulate color alpha via brightness to simulate opacity fade
                // InstancedMesh doesn't support per-instance opacity, so we darken toward black
                pool.mesh.getColorAt(p.slotIndex, _tempColor);
                // Scale RGB by opacity ratio to simulate transparency
                const opacityFactor = Math.max(0, p.opacity);
                _tempColor.multiplyScalar(opacityFactor / Math.max(opacityFactor + 0.01, _tempColor.r, _tempColor.g, _tempColor.b));
                pool.mesh.setColorAt(p.slotIndex, _tempColor);
            } else if (p.isFire) {
                // Fire flicker via color intensity variation
                const flicker = 1.0 + Math.random() * 2.0;
                pool.mesh.getColorAt(p.slotIndex, _tempColor);
                // Boost brightness for flicker effect
                _tempColor.setRGB(
                    Math.min(1, _tempColor.r * flicker * 0.5),
                    Math.min(1, _tempColor.g * flicker * 0.3),
                    Math.min(1, _tempColor.b * flicker * 0.1)
                );
                pool.mesh.setColorAt(p.slotIndex, _tempColor);
            }

            poolsWithActivity.add(p.poolType);
        }

        // Set needsUpdate flags only on pools that had activity
        for (const type of poolsWithActivity) {
            const pool = this.poolManager.pools.get(type)!;
            pool.mesh.instanceMatrix.needsUpdate = true;
            if (pool.mesh.instanceColor) {
                pool.mesh.instanceColor.needsUpdate = true;
            }
        }
    }

    // ── Clear and dispose ────────────────────────────────────────

    public clear(): void {
        this.poolManager.clear(this.particles);
        this.emitterManager.clear();
    }

    public dispose(): void {
        this.poolManager.dispose(this.particles);
        this.emitterManager.clear();
    }
}
