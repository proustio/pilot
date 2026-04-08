import * as THREE from 'three';
import { InstancedParticle, _tempColor } from './ParticleTypes';
import { ParticlePoolManager } from './ParticlePoolManager';

export class ParticleSpawner {
    private spawnCounter = 0;

    constructor(private poolManager: ParticlePoolManager, private particles: InstancedParticle[]) {}

    public spawnFire(x: number, y: number, z: number, group: THREE.Object3D, intensity: number = 1.0, spawnRateScale: number = 1.0): void {
        // Draw call budget throttle: probabilistically skip spawns
        if (spawnRateScale < 1.0 && Math.random() > spawnRateScale) return;

        const pool = this.poolManager.pools.get('fire');
        if (!pool) return;

        const slot = this.poolManager.allocateSlot(pool, this.particles);
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
        const color = isSecondary ? this.poolManager.secondaryFireMat.color : this.poolManager.fireMat.color;
        pool.mesh.setColorAt(slot, color);
    }

    public spawnSmoke(x: number, y: number, z: number, color: string, group: THREE.Object3D, intensity: number = 1.0, spawnRateScale: number = 1.0): void {
        // Draw call budget throttle: probabilistically skip spawns
        if (spawnRateScale < 1.0 && Math.random() > spawnRateScale) return;

        const pool = this.poolManager.pools.get('smoke');
        if (!pool) return;

        const slot = this.poolManager.allocateSlot(pool, this.particles);
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

    public spawnExplosion(x: number, y: number, z: number, group: THREE.Object3D, spawnRateScale: number = 1.0): void {
        // Draw call budget throttle: probabilistically skip spawns
        if (spawnRateScale < 1.0 && Math.random() > spawnRateScale) return;

        const pool = this.poolManager.pools.get('explosion');
        if (!pool) return;

        const count = 10 + Math.random() * 5;
        for (let i = 0; i < count; i++) {
            const slot = this.poolManager.allocateSlot(pool, this.particles);
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
            const color = isFire ? this.poolManager.fireMat.color : this.poolManager.greySmokeMat.color;
            pool.mesh.setColorAt(slot, color);
        }
    }

    public spawnSplash(x: number, y: number, z: number, group: THREE.Object3D, spawnRateScale: number = 1.0): void {
        // Draw call budget throttle: probabilistically skip spawns
        if (spawnRateScale < 1.0 && Math.random() > spawnRateScale) return;

        const pool = this.poolManager.pools.get('splash');
        if (!pool) return;

        const count = 15 + Math.random() * 10;
        for (let i = 0; i < count; i++) {
            const slot = this.poolManager.allocateSlot(pool, this.particles);
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

            const color = isWhite ? this.poolManager.splashMatWhite.color : this.poolManager.splashMatBlue.color;
            pool.mesh.setColorAt(slot, color);
        }
    }

    public spawnVoxelExplosion(x: number, y: number, z: number, count: number, group: THREE.Object3D, spawnRateScale: number = 1.0): void {
        // Draw call budget throttle: probabilistically skip spawns
        if (spawnRateScale < 1.0 && Math.random() > spawnRateScale) return;

        const pool = this.poolManager.pools.get('explosion');
        if (!pool) return;

        for (let i = 0; i < count; i++) {
            const slot = this.poolManager.allocateSlot(pool, this.particles);
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

            pool.mesh.setColorAt(slot, this.poolManager.shipVoxelMat.color);
        }
    }

    public spawnFog(x: number, y: number, z: number, group: THREE.Object3D): void {
        const pool = this.poolManager.pools.get('fog');
        if (!pool) return;

        const slot = this.poolManager.allocateSlot(pool, this.particles);
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

        pool.mesh.setColorAt(slot, this.poolManager.fogMat.color);
    }
}
