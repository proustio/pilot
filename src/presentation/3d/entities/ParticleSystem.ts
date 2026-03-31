import * as THREE from 'three';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { Config } from '../../../infrastructure/config/Config';
import { EmitterManager, EmitterSpawnCallback } from './EmitterManager';

// ── Interfaces ──────────────────────────────────────────────────────────────

export type ParticlePoolType = 'fire' | 'smoke' | 'explosion' | 'splash' | 'fog';

export interface InstancedParticle {
    poolType: ParticlePoolType;
    slotIndex: number;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    rotation: THREE.Euler;
    scale: number;
    opacity: number;
    life: number;
    maxLife: number;
    isSmoke: boolean;
    isFire: boolean;
    isVoxelExplosion: boolean;
    group: THREE.Object3D;
    /** Timestamp-like ordering for oldest-eviction */
    spawnOrder: number;
}

export interface InstancePool {
    mesh: THREE.InstancedMesh;
    capacity: number;
    activeCount: number;
    freeSlots: number[];
    /** Maps slot index → index in particles[] array */
    slotToParticleIndex: Map<number, number>;
}

// ── Pool configuration ──────────────────────────────────────────────────────

export const PARTICLE_POOL_CONFIG = {
    fire: { get capacity() { return Config.particles.firePoolCapacity; }, size: 0.12 },
    smoke: { get capacity() { return Config.particles.smokePoolCapacity; }, size: 0.12 },
    explosion: { get capacity() { return Config.particles.explosionPoolCapacity; }, size: 0.15 },
    splash: { get capacity() { return Config.particles.splashPoolCapacity; }, size: 0.15 },
    fog: { get capacity() { return Config.particles.fogPoolCapacity; }, size: 0.15 },
};


// ── Helpers ─────────────────────────────────────────────────────────────────

const _tempMatrix = new THREE.Matrix4();
const _tempQuaternion = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _tempColor = new THREE.Color();
const _white = new THREE.Color(0xffffff);

// ── ParticleSystem ──────────────────────────────────────────────────────────

export class ParticleSystem {
    private particles: InstancedParticle[] = [];
    private emitterManager = new EmitterManager();
    private pools = new Map<ParticlePoolType, InstancePool>();
    private spawnCounter = 0;
    private poolsInitialized = false;

    /** Cached zero-scale matrix for hiding instances */
    private readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    // Shared geometries (allocated once)
    private fireGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.fire.size, PARTICLE_POOL_CONFIG.fire.size, PARTICLE_POOL_CONFIG.fire.size);
    private smokeGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.smoke.size, PARTICLE_POOL_CONFIG.smoke.size, PARTICLE_POOL_CONFIG.smoke.size);
    private explosionGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.explosion.size, PARTICLE_POOL_CONFIG.explosion.size, PARTICLE_POOL_CONFIG.explosion.size);
    private splashGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.splash.size, PARTICLE_POOL_CONFIG.splash.size, PARTICLE_POOL_CONFIG.splash.size);
    private fogGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.fog.size, PARTICLE_POOL_CONFIG.fog.size, PARTICLE_POOL_CONFIG.fog.size);

    // Shared materials (allocated once, never cloned during gameplay)
    public fireMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff0000, roughness: 0.4 });
    public secondaryFireMat = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8c00, roughness: 0.4 });
    public greySmokeMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, transparent: true, opacity: 0.8 });
    public blackSmokeMat = new THREE.MeshStandardMaterial({ color: 0x3b3b38, transparent: true, opacity: 0.9 });
    private splashMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, roughness: 0.2 });
    private splashMatBlue = new THREE.MeshStandardMaterial({ color: 0x4fa4ff, transparent: true, opacity: 0.8, roughness: 0.2 });
    private shipVoxelMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
    private fogMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });

    /** External spawn-rate throttle (0.0–1.0), set by EntityManager draw call budget */
    public spawnRateScale = 1.0;

    constructor() {
        const updateParticleTheme = () => {
            const tm = ThemeManager.getInstance();
            const wc = tm.getWaterColors();
            this.splashMatBlue.color.copy(wc.secondary);
        };
        eventBus.on(GameEventType.THEME_CHANGED, updateParticleTheme);
        updateParticleTheme();
    }

    // ── Pool initialization (Task 1.1) ──────────────────────────────────────

    public initPools(parentGroup: THREE.Object3D): void {
        if (this.poolsInitialized) return;

        const poolDefs: { type: ParticlePoolType; geo: THREE.BufferGeometry; mat: THREE.Material }[] = [
            { type: 'fire', geo: this.fireGeo, mat: this.fireMat },
            { type: 'smoke', geo: this.smokeGeo, mat: this.greySmokeMat },
            { type: 'explosion', geo: this.explosionGeo, mat: this.shipVoxelMat },
            { type: 'splash', geo: this.splashGeo, mat: this.splashMatBlue },
            { type: 'fog', geo: this.fogGeo, mat: this.fogMat },
        ];

        for (const def of poolDefs) {
            const capacity = PARTICLE_POOL_CONFIG[def.type].capacity;
            const mesh = new THREE.InstancedMesh(def.geo, def.mat, capacity);
            mesh.frustumCulled = false;

            // Force instanceColor buffer creation
            mesh.setColorAt(0, _white);
            mesh.setColorAt(0, new THREE.Color(0, 0, 0));

            // Initialize all instances to zero-scale (hidden)
            for (let i = 0; i < capacity; i++) {
                mesh.setMatrixAt(i, this.zeroMatrix);
            }
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

            // Build free list (all slots available)
            const freeSlots: number[] = [];
            for (let i = capacity - 1; i >= 0; i--) {
                freeSlots.push(i);
            }

            const pool: InstancePool = {
                mesh,
                capacity,
                activeCount: 0,
                freeSlots,
                slotToParticleIndex: new Map(),
            };

            this.pools.set(def.type, pool);
            parentGroup.add(mesh);
        }

        this.poolsInitialized = true;
    }


    // ── Slot allocator (Task 1.2) ───────────────────────────────────────────

    private allocateSlot(pool: InstancePool): number {
        if (pool.freeSlots.length > 0) {
            const slot = pool.freeSlots.pop()!;
            pool.activeCount++;
            return slot;
        }
        // Pool full — recycle oldest active particle of this pool type
        let oldestIdx = -1;
        let oldestOrder = Infinity;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (this.pools.get(p.poolType)?.mesh === pool.mesh && p.spawnOrder < oldestOrder) {
                oldestOrder = p.spawnOrder;
                oldestIdx = i;
            }
        }
        if (oldestIdx >= 0) {
            const evicted = this.particles[oldestIdx];
            const slot = evicted.slotIndex;
            pool.slotToParticleIndex.delete(slot);
            // Swap-and-pop the evicted particle
            const lastIdx = this.particles.length - 1;
            if (oldestIdx !== lastIdx) {
                this.particles[oldestIdx] = this.particles[lastIdx];
                // Update the moved particle's mapping
                const movedP = this.particles[oldestIdx];
                const movedPool = this.pools.get(movedP.poolType)!;
                movedPool.slotToParticleIndex.set(movedP.slotIndex, oldestIdx);
            }
            this.particles.pop();
            // activeCount stays the same (we evicted one, will add one)
            return slot;
        }
        // Fallback: shouldn't happen, but use slot 0
        return 0;
    }

    private releaseSlot(pool: InstancePool, slot: number): void {
        pool.mesh.setMatrixAt(slot, this.zeroMatrix);
        pool.slotToParticleIndex.delete(slot);
        pool.freeSlots.push(slot);
        pool.activeCount = Math.max(0, pool.activeCount - 1);
    }

    // ── Spawn methods (Task 1.3) ────────────────────────────────────────────

    public hasActiveParticles(): boolean {
        return this.particles.some(p => !p.isSmoke && !p.isFire);
    }

    public spawnFire(x: number, y: number, z: number, group: THREE.Object3D, intensity: number = 1.0): void {
        const pool = this.pools.get('fire');
        if (!pool) return;

        const slot = this.allocateSlot(pool);
        const isSecondary = Math.random() > 0.4;
        const scale = 0.6 + intensity * 0.6;
        const life = 0.5 + Math.random() * 0.25;

        const particle: InstancedParticle = {
            poolType: 'fire',
            slotIndex: slot,
            position: new THREE.Vector3(
                x + (Math.random() - 0.5) * 0.2,
                y,
                z + (Math.random() - 0.5) * 0.2
            ),
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,
                0.04 + Math.random() * 0.04,
                (Math.random() - 0.5) * 0.02
            ),
            rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
            scale,
            opacity: 1.0,
            life,
            maxLife: life,
            isSmoke: false,
            isFire: true,
            isVoxelExplosion: false,
            group,
            spawnOrder: this.spawnCounter++,
        };

        const idx = this.particles.length;
        this.particles.push(particle);
        pool.slotToParticleIndex.set(slot, idx);

        // Write initial color (fire or secondary fire color)
        const color = isSecondary ? this.secondaryFireMat.color : this.fireMat.color;
        pool.mesh.setColorAt(slot, color);
    }

    public spawnSmoke(x: number, y: number, z: number, color: string, group: THREE.Object3D, intensity: number = 1.0): void {
        const pool = this.pools.get('smoke');
        if (!pool) return;

        const slot = this.allocateSlot(pool);
        const scale = 0.8 + intensity * 0.4;
        const life = 1.0 + Math.random() * 0.5;

        const particle: InstancedParticle = {
            poolType: 'smoke',
            slotIndex: slot,
            position: new THREE.Vector3(
                x + (Math.random() - 0.5) * 0.7,
                y,
                z + (Math.random() - 0.5) * 0.7
            ),
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.005,
                0.02 + Math.random() * 0.02,
                (Math.random() - 0.5) * 0.005
            ),
            rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
            scale,
            opacity: 0.8,
            life,
            maxLife: life,
            isSmoke: true,
            isFire: false,
            isVoxelExplosion: false,
            group,
            spawnOrder: this.spawnCounter++,
        };

        const idx = this.particles.length;
        this.particles.push(particle);
        pool.slotToParticleIndex.set(slot, idx);

        // Write smoke color (no material.clone() — shared material, per-instance color)
        _tempColor.set(color);
        pool.mesh.setColorAt(slot, _tempColor);
    }

    public spawnExplosion(x: number, y: number, z: number, group: THREE.Object3D): void {
        const pool = this.pools.get('explosion');
        if (!pool) return;

        const count = 10 + Math.random() * 5;
        for (let i = 0; i < count; i++) {
            const slot = this.allocateSlot(pool);
            const isFire = Math.random() > 0.5;
            const life = 1.0;

            const particle: InstancedParticle = {
                poolType: 'explosion',
                slotIndex: slot,
                position: new THREE.Vector3(
                    x + (Math.random() - 0.5) * 0.5,
                    y + Math.random() * 0.5,
                    z + (Math.random() - 0.5) * 0.5
                ),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.05,
                    Math.random() * 0.1 + 0.05,
                    (Math.random() - 0.5) * 0.05
                ),
                rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
                scale: 1.0,
                opacity: 1.0,
                life,
                maxLife: life,
                isSmoke: false,
                isFire: false,
                isVoxelExplosion: false,
                group,
                spawnOrder: this.spawnCounter++,
            };

            const idx = this.particles.length;
            this.particles.push(particle);
            pool.slotToParticleIndex.set(slot, idx);

            // Color: fire orange or grey smoke
            const color = isFire ? this.fireMat.color : this.greySmokeMat.color;
            pool.mesh.setColorAt(slot, color);
        }
    }

    public spawnSplash(x: number, y: number, z: number, group: THREE.Object3D): void {
        const pool = this.pools.get('splash');
        if (!pool) return;

        const count = 15 + Math.random() * 10;
        for (let i = 0; i < count; i++) {
            const slot = this.allocateSlot(pool);
            const isWhite = Math.random() > 0.6;
            const life = 0.6 + Math.random() * 0.4;

            const particle: InstancedParticle = {
                poolType: 'splash',
                slotIndex: slot,
                position: new THREE.Vector3(
                    x + (Math.random() - 0.5) * 0.4,
                    y,
                    z + (Math.random() - 0.5) * 0.4
                ),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.04,
                    Math.random() * 0.15 + 0.05,
                    (Math.random() - 0.5) * 0.04
                ),
                rotation: new THREE.Euler(0, 0, 0),
                scale: 1.0,
                opacity: isWhite ? 0.7 : 0.8,
                life,
                maxLife: 1.0,
                isSmoke: false,
                isFire: false,
                isVoxelExplosion: false,
                group,
                spawnOrder: this.spawnCounter++,
            };

            const idx = this.particles.length;
            this.particles.push(particle);
            pool.slotToParticleIndex.set(slot, idx);

            const color = isWhite ? this.splashMatWhite.color : this.splashMatBlue.color;
            pool.mesh.setColorAt(slot, color);
        }
    }

    public spawnVoxelExplosion(x: number, y: number, z: number, count: number, group: THREE.Object3D): void {
        const pool = this.pools.get('explosion');
        if (!pool) return;

        for (let i = 0; i < count; i++) {
            const slot = this.allocateSlot(pool);
            const life = 1.5 + Math.random() * 0.5;

            const particle: InstancedParticle = {
                poolType: 'explosion',
                slotIndex: slot,
                position: new THREE.Vector3(
                    x + (Math.random() - 0.5) * 0.5,
                    y + Math.random() * 0.5,
                    z + (Math.random() - 0.5) * 0.5
                ),
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.15,
                    Math.random() * 0.15 + 0.05,
                    (Math.random() - 0.5) * 0.15
                ),
                rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
                scale: 0.67, // 0.1/0.15 ratio to match original voxel size vs explosion geo
                opacity: 1.0,
                life,
                maxLife: 2.0,
                isSmoke: false,
                isFire: false,
                isVoxelExplosion: true,
                group,
                spawnOrder: this.spawnCounter++,
            };

            const idx = this.particles.length;
            this.particles.push(particle);
            pool.slotToParticleIndex.set(slot, idx);

            pool.mesh.setColorAt(slot, this.shipVoxelMat.color);
        }
    }

    public spawnFog(x: number, y: number, z: number, group: THREE.Object3D): void {
        const pool = this.pools.get('fog');
        if (!pool) return;

        const slot = this.allocateSlot(pool);
        const life = 999; // Fog particles are long-lived, managed externally

        const particle: InstancedParticle = {
            poolType: 'fog',
            slotIndex: slot,
            position: new THREE.Vector3(x, y, z),
            velocity: new THREE.Vector3(0, 0, 0),
            rotation: new THREE.Euler(0, 0, 0),
            scale: 1.0,
            opacity: 0.6,
            life,
            maxLife: life,
            isSmoke: false,
            isFire: false,
            isVoxelExplosion: false,
            group,
            spawnOrder: this.spawnCounter++,
        };

        const idx = this.particles.length;
        this.particles.push(particle);
        pool.slotToParticleIndex.set(slot, idx);

        pool.mesh.setColorAt(slot, this.fogMat.color);
    }


    // ── Emitter delegation (unchanged public API) ───────────────────────────

    public addEmitter(x: number, y: number, z: number, hasFire: boolean, group: THREE.Object3D, color?: string, intensity: number = 1.0, id?: string): void {
        const emitterColor = color || this.blackSmokeMat.color.getStyle();
        this.emitterManager.addEmitter(x, y, z, hasFire, group, emitterColor, intensity, id);
    }

    public updateEmittersByIdPrefix(prefix: string, intensity: number): void {
        this.emitterManager.updateEmittersByIdPrefix(prefix, intensity);
    }

    // ── Update loop (Task 1.4) ──────────────────────────────────────────────

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
            if (p.life <= 0 || p.position.y < -3) {
                const pool = this.pools.get(p.poolType)!;
                this.releaseSlot(pool, p.slotIndex);

                // Swap-and-pop
                const lastIdx = this.particles.length - 1;
                if (i !== lastIdx) {
                    this.particles[i] = this.particles[lastIdx];
                    const movedP = this.particles[i];
                    const movedPool = this.pools.get(movedP.poolType)!;
                    movedPool.slotToParticleIndex.set(movedP.slotIndex, i);
                }
                this.particles.pop();
                poolsWithActivity.add(p.poolType);
                continue;
            }

            // Write instance matrix
            const pool = this.pools.get(p.poolType)!;
            _tempQuaternion.setFromEuler(p.rotation);
            _tempScale.setScalar(p.scale);
            _tempMatrix.compose(p.position, _tempQuaternion, _tempScale);
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
            const pool = this.pools.get(type)!;
            pool.mesh.instanceMatrix.needsUpdate = true;
            if (pool.mesh.instanceColor) {
                pool.mesh.instanceColor.needsUpdate = true;
            }
        }
    }

    // ── Clear and dispose (Task 1.5) ────────────────────────────────────────

    public clear(): void {
        // Zero all instance matrices, reset pool state
        for (const [, pool] of this.pools) {
            for (let i = 0; i < pool.capacity; i++) {
                pool.mesh.setMatrixAt(i, this.zeroMatrix);
            }
            pool.mesh.instanceMatrix.needsUpdate = true;
            pool.activeCount = 0;
            pool.slotToParticleIndex.clear();
            // Refill free list
            pool.freeSlots.length = 0;
            for (let i = pool.capacity - 1; i >= 0; i--) {
                pool.freeSlots.push(i);
            }
        }
        this.particles = [];
        this.emitterManager.clear();
    }

    public dispose(): void {
        this.clear();
        for (const [, pool] of this.pools) {
            pool.mesh.geometry.dispose();
            if (Array.isArray(pool.mesh.material)) {
                pool.mesh.material.forEach(m => m.dispose());
            } else {
                pool.mesh.material.dispose();
            }
            pool.mesh.dispose();
        }
        this.pools.clear();
        this.poolsInitialized = false;

        // Dispose shared geometries
        this.fireGeo.dispose();
        this.smokeGeo.dispose();
        this.explosionGeo.dispose();
        this.splashGeo.dispose();
        this.fogGeo.dispose();

        // Dispose shared materials
        this.fireMat.dispose();
        this.secondaryFireMat.dispose();
        this.greySmokeMat.dispose();
        this.blackSmokeMat.dispose();
        this.splashMatWhite.dispose();
        this.splashMatBlue.dispose();
        this.shipVoxelMat.dispose();
        this.fogMat.dispose();
    }
}
