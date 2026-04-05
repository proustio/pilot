import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { EmitterManager, EmitterSpawnCallback } from './EmitterManager';
import { InstancedParticle, _tempMatrix, _tempQuaternion, _tempScale, _tempColor, _tempPos, ParticlePoolType } from './ParticleTypes';
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

    public update(time?: number): void {
        // Delegate emitter spawn scheduling
        this.emitterManager.updateEmitters(this as unknown as EmitterSpawnCallback);

        const speed = Config.timing.gameSpeedMultiplier;

        // Update global shader uniforms
        if (time !== undefined) {
            this.poolManager.particleShaderMaterial.uniforms.time.value = time;
            this.poolManager.particleShaderMaterial.uniforms.gameSpeed.value = speed;
        }

        const needsMatrixUpdate = new Set<ParticlePoolType>();

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.life -= 0.016 * speed; // Keep logical life tracked for cleanup

            if (this.isParticleExpired(p)) {
                this.removeParticle(i, p);
            } else {
                // Update matrix to track moving objects correctly
                const pool = this.poolManager.pools.get(p.poolType);
                if (pool) {
                    _tempPos.copy(p.position);
                    p.group.localToWorld(_tempPos);

                    if (this.poolManager.poolParent) {
                        this.poolManager.poolParent.worldToLocal(_tempPos);
                    }

                    _tempMatrix.makeScale(p.scale, p.scale, p.scale);
                    _tempMatrix.setPosition(_tempPos);
                    pool.mesh.setMatrixAt(p.slotIndex, _tempMatrix);
                    needsMatrixUpdate.add(p.poolType);
                }
            }
        }

        for (const poolType of needsMatrixUpdate) {
            const pool = this.poolManager.pools.get(poolType);
            if (pool) {
                pool.mesh.instanceMatrix.needsUpdate = true;
            }
        }
    }

    private isParticleExpired(p: InstancedParticle): boolean {
        // For particles on non-poolParent groups, check Y in pool-parent space
        let checkY = p.position.y;
        if (p.group !== this.poolManager.poolParent && this.poolManager.poolParent) {
            _tempPos.copy(p.position);
            p.group.localToWorld(_tempPos);
            this.poolManager.poolParent.worldToLocal(_tempPos);
            checkY = _tempPos.y;
        }
        return p.life <= 0 || checkY < -3;
    }

    private removeParticle(index: number, p: InstancedParticle): void {
        const pool = this.poolManager.pools.get(p.poolType)!;
        this.poolManager.releaseSlot(pool, p.slotIndex);

        // Reset GPU instance so it doesn't render from an old position
        pool.mesh.setMatrixAt(p.slotIndex, this.poolManager.zeroMatrix);
        pool.mesh.instanceMatrix.needsUpdate = true;

        // Swap-and-pop
        const lastIdx = this.particles.length - 1;
        if (index !== lastIdx) {
            this.particles[index] = this.particles[lastIdx];
            const movedP = this.particles[index];
            const movedPool = this.poolManager.pools.get(movedP.poolType)!;
            movedPool.slotToParticleIndex.set(movedP.slotIndex, index);
        }
        this.particles.pop();
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
