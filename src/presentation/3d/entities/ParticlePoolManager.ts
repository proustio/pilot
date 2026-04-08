import * as THREE from 'three';
import { ParticlePoolType, InstancePool, PARTICLE_POOL_CONFIG, InstancedParticle, _white } from './ParticleTypes';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

export class ParticlePoolManager {
    public pools = new Map<ParticlePoolType, InstancePool>();
    public poolsInitialized = false;
    public poolParent: THREE.Object3D | null = null;
    public readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    // Shared geometries (allocated once)
    public fireGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.fire.size, PARTICLE_POOL_CONFIG.fire.size, PARTICLE_POOL_CONFIG.fire.size);
    public smokeGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.smoke.size, PARTICLE_POOL_CONFIG.smoke.size, PARTICLE_POOL_CONFIG.smoke.size);
    public explosionGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.explosion.size, PARTICLE_POOL_CONFIG.explosion.size, PARTICLE_POOL_CONFIG.explosion.size);
    public splashGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.splash.size, PARTICLE_POOL_CONFIG.splash.size, PARTICLE_POOL_CONFIG.splash.size);
    public fogGeo = new THREE.BoxGeometry(PARTICLE_POOL_CONFIG.fog.size, PARTICLE_POOL_CONFIG.fog.size, PARTICLE_POOL_CONFIG.fog.size);

    // Shared materials (allocated once, never cloned during gameplay)
    public fireMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff0000, roughness: 0.4 });
    public secondaryFireMat = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8c00, roughness: 0.4 });
    public greySmokeMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, transparent: true, opacity: 0.8 });
    public blackSmokeMat = new THREE.MeshStandardMaterial({ color: 0x3b3b38, transparent: true, opacity: 0.9 });
    public splashMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, roughness: 0.2 });
    public splashMatBlue = new THREE.MeshStandardMaterial({ color: 0x4fa4ff, transparent: true, opacity: 0.8, roughness: 0.2 });
    public shipVoxelMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
    public fogMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });

    constructor() {
        const updateParticleTheme = () => {
            const tm = ThemeManager.getInstance();
            const wc = tm.getWaterColors();
            this.splashMatBlue.color.copy(wc.secondary);
        };
        eventBus.on(GameEventType.THEME_CHANGED, updateParticleTheme);
        updateParticleTheme();
    }

    public initPools(parentGroup: THREE.Object3D): void {
        if (this.poolsInitialized) return;
        this.poolParent = parentGroup;

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

    public allocateSlot(pool: InstancePool, particlesArray: InstancedParticle[]): number {
        if (pool.freeSlots.length > 0) {
            const slot = pool.freeSlots.pop()!;
            pool.activeCount++;
            return slot;
        }
        // Pool full — recycle oldest active particle of this pool type
        let oldestIdx = -1;
        let oldestOrder = Infinity;
        for (let i = 0; i < particlesArray.length; i++) {
            const p = particlesArray[i];
            if (this.pools.get(p.poolType)?.mesh === pool.mesh && p.spawnOrder < oldestOrder) {
                oldestOrder = p.spawnOrder;
                oldestIdx = i;
            }
        }
        if (oldestIdx >= 0) {
            const evicted = particlesArray[oldestIdx];
            const slot = evicted.slotIndex;
            pool.slotToParticleIndex.delete(slot);
            // Swap-and-pop the evicted particle
            const lastIdx = particlesArray.length - 1;
            if (oldestIdx !== lastIdx) {
                particlesArray[oldestIdx] = particlesArray[lastIdx];
                // Update the moved particle's mapping
                const movedP = particlesArray[oldestIdx];
                const movedPool = this.pools.get(movedP.poolType)!;
                movedPool.slotToParticleIndex.set(movedP.slotIndex, oldestIdx);
            }
            particlesArray.pop();
            // activeCount stays the same (we evicted one, will add one)
            return slot;
        }
        // Fallback: shouldn't happen, but use slot 0
        return 0;
    }

    public releaseSlot(pool: InstancePool, slot: number): void {
        pool.mesh.setMatrixAt(slot, this.zeroMatrix);
        pool.slotToParticleIndex.delete(slot);
        pool.freeSlots.push(slot);
        pool.activeCount = Math.max(0, pool.activeCount - 1);
    }

    public clear(particlesArray: InstancedParticle[]): void {
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
        particlesArray.length = 0;
    }

    public dispose(particlesArray: InstancedParticle[]): void {
        this.clear(particlesArray);
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
