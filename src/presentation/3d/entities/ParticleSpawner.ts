import * as THREE from 'three';
import { InstancedParticle, _tempColor, _tempPos, _tempQuaternion, _tempScale, _tempMatrix } from './ParticleTypes';
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

        const localPos = new THREE.Vector3(
            x + (Math.random() - 0.5) * 0.2,
            y,
            z + (Math.random() - 0.5) * 0.2
        );
        if (group !== this.poolManager.poolParent && this.poolManager.poolParent) {
            group.localToWorld(localPos);
            this.poolManager.poolParent.worldToLocal(localPos);
        }

        const particle: InstancedParticle = {
            poolType: 'fire',
            poolRef: pool,
            slotIndex: slot,
            position: localPos,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,
                0.04 + Math.random() * 0.04,
                (Math.random() - 0.5) * 0.02
            ),
            rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
            scale,
            scaleDelta: -0.015, // Approx replaces *= 0.96
            rotationDelta: 0.05,
            gravityModifier: 0,
            colorFadeRate: 0, // We drop the complex flicker per frame for performance, or handle via shader if needed
            opacity: 1.0,
            life,
            maxLife: life,
            spawnOrder: this.spawnCounter++,
        };

        const idx = this.particles.length;
        this.particles.push(particle);
        pool.slotToParticleIndex.set(slot, idx);

        // Write initial color (fire or secondary fire color)
        const color = isSecondary ? this.poolManager.secondaryFireMat.color : this.poolManager.fireMat.color;
        pool.mesh.setColorAt(slot, color);

        this.injectInitialTransform(particle);
    }

    public spawnSmoke(x: number, y: number, z: number, color: string, group: THREE.Object3D, intensity: number = 1.0, spawnRateScale: number = 1.0): void {
        // Draw call budget throttle: probabilistically skip spawns
        if (spawnRateScale < 1.0 && Math.random() > spawnRateScale) return;

        const pool = this.poolManager.pools.get('smoke');
        if (!pool) return;

        const slot = this.poolManager.allocateSlot(pool, this.particles);
        const scale = 0.8 + intensity * 0.4;
        const life = 1.0 + Math.random() * 0.5;

        const localPos = new THREE.Vector3(
            x + (Math.random() - 0.5) * 0.7,
            y,
            z + (Math.random() - 0.5) * 0.7
        );
        if (group !== this.poolManager.poolParent && this.poolManager.poolParent) {
            group.localToWorld(localPos);
            this.poolManager.poolParent.worldToLocal(localPos);
        }

        const particle: InstancedParticle = {
            poolType: 'smoke',
            poolRef: pool,
            slotIndex: slot,
            position: localPos,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.005,
                0.02 + Math.random() * 0.02,
                (Math.random() - 0.5) * 0.005
            ),
            rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
            scale,
            scaleDelta: 0.005, // Smoke expands
            rotationDelta: 0.05,
            gravityModifier: 0,
            colorFadeRate: 0.8 / life, // Fade to black
            opacity: 0.8,
            life,
            maxLife: life,
            spawnOrder: this.spawnCounter++,
        };

        const idx = this.particles.length;
        this.particles.push(particle);
        pool.slotToParticleIndex.set(slot, idx);

        // Write smoke color (no material.clone() — shared material, per-instance color)
        _tempColor.set(color);
        pool.mesh.setColorAt(slot, _tempColor);

        this.injectInitialTransform(particle);
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

            const localPos = new THREE.Vector3(
                x + (Math.random() - 0.5) * 0.5,
                y + Math.random() * 0.5,
                z + (Math.random() - 0.5) * 0.5
            );
            if (group !== this.poolManager.poolParent && this.poolManager.poolParent) {
                group.localToWorld(localPos);
                this.poolManager.poolParent.worldToLocal(localPos);
            }

            const particle: InstancedParticle = {
                poolType: 'explosion',
                poolRef: pool,
                slotIndex: slot,
                position: localPos,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.05,
                    Math.random() * 0.1 + 0.05,
                    (Math.random() - 0.5) * 0.05
                ),
                rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
                scale: 1.0,
                scaleDelta: -0.015,
                rotationDelta: 0.05,
                gravityModifier: 0.005,
                colorFadeRate: 0,
                opacity: 1.0,
                life,
                maxLife: life,
                spawnOrder: this.spawnCounter++,
            };

            const idx = this.particles.length;
            this.particles.push(particle);
            pool.slotToParticleIndex.set(slot, idx);

            // Color: fire orange or grey smoke
            const color = isFire ? this.poolManager.fireMat.color : this.poolManager.greySmokeMat.color;
            pool.mesh.setColorAt(slot, color);

            this.injectInitialTransform(particle);
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

            const localPos = new THREE.Vector3(
                x + (Math.random() - 0.5) * 0.4,
                y,
                z + (Math.random() - 0.5) * 0.4
            );
            if (group !== this.poolManager.poolParent && this.poolManager.poolParent) {
                group.localToWorld(localPos);
                this.poolManager.poolParent.worldToLocal(localPos);
            }

            const particle: InstancedParticle = {
                poolType: 'splash',
                poolRef: pool,
                slotIndex: slot,
                position: localPos,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.04,
                    Math.random() * 0.15 + 0.05,
                    (Math.random() - 0.5) * 0.04
                ),
                rotation: new THREE.Euler(0, 0, 0),
                scale: 1.0,
                scaleDelta: 0,
                rotationDelta: 0,
                gravityModifier: 0.005,
                colorFadeRate: 0,
                opacity: isWhite ? 0.7 : 0.8,
                life,
                maxLife: 1.0,
                spawnOrder: this.spawnCounter++,
            };

            const idx = this.particles.length;
            this.particles.push(particle);
            pool.slotToParticleIndex.set(slot, idx);

            const color = isWhite ? this.poolManager.splashMatWhite.color : this.poolManager.splashMatBlue.color;
            pool.mesh.setColorAt(slot, color);

            this.injectInitialTransform(particle);
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

            const localPos = new THREE.Vector3(
                x + (Math.random() - 0.5) * 0.5,
                y + Math.random() * 0.5,
                z + (Math.random() - 0.5) * 0.5
            );
            if (group !== this.poolManager.poolParent && this.poolManager.poolParent) {
                group.localToWorld(localPos);
                this.poolManager.poolParent.worldToLocal(localPos);
            }

            const particle: InstancedParticle = {
                poolType: 'explosion',
                poolRef: pool,
                slotIndex: slot,
                position: localPos,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.15,
                    Math.random() * 0.15 + 0.05,
                    (Math.random() - 0.5) * 0.15
                ),
                rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
                scale: 0.67, // 0.1/0.15 ratio to match original voxel size vs explosion geo
                scaleDelta: -0.01,
                rotationDelta: 0.05,
                gravityModifier: 0.005,
                colorFadeRate: 0,
                opacity: 1.0,
                life,
                maxLife: 2.0,
                spawnOrder: this.spawnCounter++,
            };

            const idx = this.particles.length;
            this.particles.push(particle);
            pool.slotToParticleIndex.set(slot, idx);

            pool.mesh.setColorAt(slot, this.poolManager.shipVoxelMat.color);

            this.injectInitialTransform(particle);
        }
    }

    public spawnFog(x: number, y: number, z: number, group: THREE.Object3D): void {
        const pool = this.poolManager.pools.get('fog');
        if (!pool) return;

        const slot = this.poolManager.allocateSlot(pool, this.particles);
        const life = 999; // Fog particles are long-lived, managed externally

        const localPos = new THREE.Vector3(x, y, z);
        if (group !== this.poolManager.poolParent && this.poolManager.poolParent) {
            group.localToWorld(localPos);
            this.poolManager.poolParent.worldToLocal(localPos);
        }

        const particle: InstancedParticle = {
            poolType: 'fog',
            poolRef: pool,
            slotIndex: slot,
            position: localPos,
            velocity: new THREE.Vector3(0, 0, 0),
            rotation: new THREE.Euler(0, 0, 0),
            scale: 1.0,
            scaleDelta: 0,
            rotationDelta: 0,
            gravityModifier: 0,
            colorFadeRate: 0,
            opacity: 0.6,
            life,
            maxLife: life,
            spawnOrder: this.spawnCounter++,
        };

        const idx = this.particles.length;
        this.particles.push(particle);
        pool.slotToParticleIndex.set(slot, idx);

        pool.mesh.setColorAt(slot, this.poolManager.fogMat.color);

        this.injectInitialTransform(particle);
    }

    private injectInitialTransform(p: InstancedParticle): void {
        _tempPos.copy(p.position);
        _tempQuaternion.setFromEuler(p.rotation);
        _tempScale.setScalar(p.scale);
        _tempMatrix.compose(_tempPos, _tempQuaternion, _tempScale);
        p.poolRef.mesh.setMatrixAt(p.slotIndex, _tempMatrix);
        p.poolRef.mesh.instanceMatrix.needsUpdate = true;
    }
}
