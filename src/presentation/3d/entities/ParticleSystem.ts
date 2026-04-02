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
            this.updateParticleBehavior(p, speed);

            if (this.isParticleExpired(p)) {
                this.removeParticle(i, p);
            } else {
                this.updateParticleTransform(p);
                this.updateParticleColor(p);
            }
            poolsWithActivity.add(p.poolType);
        }

        this.flushPoolUpdates(poolsWithActivity);
    }

    private updateParticleBehavior(p: InstancedParticle, speed: number): void {
        // Apply deltas
        p.position.addScaledVector(p.velocity, speed);
        p.scale += p.scaleDelta * speed;
        p.rotation.x += p.rotationDelta * speed;
        p.rotation.y += p.rotationDelta * speed;
        p.velocity.y -= p.gravityModifier * speed;

        // Random drift for fire/smoke
        if (p.scaleDelta !== 0 && p.gravityModifier === 0) { // proxy for smoke/fire
            p.velocity.x += (Math.random() - 0.5) * 0.005 * speed;
            p.velocity.z += (Math.random() - 0.5) * 0.005 * speed;
        }

        p.life -= 0.016 * speed;

        // Scale down at end of life for physics objects
        if (p.life < p.maxLife * 0.3 && p.gravityModifier > 0) {
            p.scale *= 0.9;
        }
    }

    private isParticleExpired(p: InstancedParticle): boolean {
        return p.life <= 0 || p.position.y < -3;
    }

    private removeParticle(index: number, p: InstancedParticle): void {
        this.poolManager.releaseSlot(p.poolRef, p.slotIndex);

        // Swap-and-pop
        const lastIdx = this.particles.length - 1;
        if (index !== lastIdx) {
            this.particles[index] = this.particles[lastIdx];
            const movedP = this.particles[index];
            movedP.poolRef.slotToParticleIndex.set(movedP.slotIndex, index);
        }
        this.particles.pop();
    }

    private updateParticleTransform(p: InstancedParticle): void {
        if (p.rotationDelta === 0 && p.scaleDelta === 0 && p.gravityModifier === 0) {
            // Fog or Splash (straight line, no rotation, no scale) -> inject position directly
            p.poolRef.mesh.getMatrixAt(p.slotIndex, _tempMatrix);
            _tempMatrix.elements[12] = p.position.x;
            _tempMatrix.elements[13] = p.position.y;
            _tempMatrix.elements[14] = p.position.z;
            p.poolRef.mesh.setMatrixAt(p.slotIndex, _tempMatrix);
        } else {
            // Standard compose
            _tempPos.copy(p.position);
            _tempQuaternion.setFromEuler(p.rotation);
            _tempScale.setScalar(p.scale);
            _tempMatrix.compose(_tempPos, _tempQuaternion, _tempScale);
            p.poolRef.mesh.setMatrixAt(p.slotIndex, _tempMatrix);
        }
    }

    private updateParticleColor(p: InstancedParticle): void {
        if (p.colorFadeRate === 0) return;

        p.poolRef.mesh.getColorAt(p.slotIndex, _tempColor);
        p.opacity -= p.colorFadeRate * 0.016 * Config.timing.gameSpeedMultiplier;
        const opacityFactor = Math.max(0, p.opacity);
        _tempColor.multiplyScalar(opacityFactor / Math.max(opacityFactor + 0.01, _tempColor.r, _tempColor.g, _tempColor.b));
        p.poolRef.mesh.setColorAt(p.slotIndex, _tempColor);
    }

    private flushPoolUpdates(poolsWithActivity: Set<ParticlePoolType>): void {
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
