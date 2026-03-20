import * as THREE from 'three';

interface Particle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    isSmoke: boolean;
    isFire?: boolean;
    group: THREE.Object3D;
}

interface Emitter {
    id?: string;
    x: number;
    y: number;
    z: number;
    color: string;
    hasFire: boolean;
    nextSpawn: number;
    intensity: number;
    group: THREE.Object3D;
}

export class ParticleSystem {
    private particles: Particle[] = [];
    private emitters: Emitter[] = [];

    private explosionGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    private smokeGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    private fireGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);

    public hasActiveParticles(): boolean {
        // Only count explosion/splash/voxel particles, not continuous smoke/fire emitters
        return this.particles.some(p => !p.isSmoke && !p.isFire);
    }


    // Materials
    public fireMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff0000, roughness: 0.4 });
    public secondaryFireMat = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8c00, roughness: 0.4 });
    public greySmokeMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, transparent: true, opacity: 0.8 });
    public blackSmokeMat = new THREE.MeshStandardMaterial({ color: 0x3b3b38, transparent: true, opacity: 0.9 });
    private splashMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, roughness: 0.2 });
    private splashMatBlue = new THREE.MeshStandardMaterial({ color: 0x4fa4ff, transparent: true, opacity: 0.8, roughness: 0.2 });
    private shipVoxelMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });

    constructor() { }

    public spawnExplosion(x: number, y: number, z: number, group: THREE.Object3D) {
        // Spawn 10-15 fiery/grey particles bursting outwards
        const count = 10 + Math.random() * 5;
        for (let i = 0; i < count; i++) {
            const isFire = Math.random() > 0.5;
            const mesh = new THREE.Mesh(this.explosionGeo, isFire ? this.fireMat : this.greySmokeMat);

            // Random position slightly offset from center
            mesh.position.set(
                x + (Math.random() - 0.5) * 0.5,
                y + Math.random() * 0.5,
                z + (Math.random() - 0.5) * 0.5
            );

            // Outward velocity
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.05,
                Math.random() * 0.1 + 0.05,
                (Math.random() - 0.5) * 0.05
            );

            group.add(mesh);
            this.particles.push({
                mesh,
                velocity,
                life: 1.0,
                maxLife: 1.0,
                isSmoke: false,
                group
            });
        }
    }

    public spawnSplash(x: number, y: number, z: number, group: THREE.Object3D) {
        // Spawn 15-25 water particles bursting mainly upwards
        const count = 15 + Math.random() * 10;
        for (let i = 0; i < count; i++) {
            const isWhite = Math.random() > 0.6;
            const mesh = new THREE.Mesh(this.explosionGeo, isWhite ? this.splashMatWhite : this.splashMatBlue);

            // Random position slightly offset from center
            mesh.position.set(
                x + (Math.random() - 0.5) * 0.4,
                y,
                z + (Math.random() - 0.5) * 0.4
            );

            // Upward and slightly outward velocity (fountain shape)
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.04,
                Math.random() * 0.15 + 0.05, // Faster upwards
                (Math.random() - 0.5) * 0.04
            );

            group.add(mesh);
            this.particles.push({
                mesh,
                velocity,
                life: 0.6 + Math.random() * 0.4, // Shorter life than fire
                maxLife: 1.0,
                isSmoke: false, // Use gravity
                group
            });
        }
    }

    public spawnVoxelExplosion(x: number, y: number, z: number, count: number, group: THREE.Object3D) {
        const voxelGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(voxelGeo, this.shipVoxelMat);

            // Position near impact area
            mesh.position.set(
                x + (Math.random() - 0.5) * 0.5,
                y + Math.random() * 0.5,
                z + (Math.random() - 0.5) * 0.5
            );

            // Strong outward/upward blast
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.15,
                Math.random() * 0.15 + 0.05,
                (Math.random() - 0.5) * 0.15
            );

            // Random slight rotation
            mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            group.add(mesh);
            this.particles.push({
                mesh,
                velocity,
                life: 1.5 + Math.random() * 0.5,
                maxLife: 2.0,
                isSmoke: false, // Gravity applies
                group
            });
        }
    }

    public spawnSmoke(x: number, y: number, z: number, color: string, group: THREE.Object3D, intensity: number = 1.0) {
        // Use blackSmokeMat as base for dark colors to get higher opacity (0.9 vs 0.8)
        const isDark = color === this.blackSmokeMat.color.getStyle();
        const mat = (isDark ? this.blackSmokeMat : this.greySmokeMat).clone();
        mat.color.set(color);
        const mesh = new THREE.Mesh(this.smokeGeo, mat);

        // Scale smoke based on intensity
        mesh.scale.setScalar(0.8 + intensity * 0.4);
        // Wider horizontal spread to stay within cell (1.0) with many small voxels
        mesh.position.set(
            x + (Math.random() - 0.5) * 0.7,
            y,
            z + (Math.random() - 0.5) * 0.7
        );

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.005, // Reduced drift
            0.02 + Math.random() * 0.02,
            (Math.random() - 0.5) * 0.005  // Reduced drift
        );

        // Random slight rotation
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        group.add(mesh);

        // Reduced life: ~1.0-1.5s instead of 2-3s
        const life = 1.0 + Math.random() * 0.5;
        this.particles.push({
            mesh,
            velocity,
            life: life,
            maxLife: life,
            isSmoke: true,
            group
        });
    }

    public spawnFire(x: number, y: number, z: number, group: THREE.Object3D, intensity: number = 1.0) {
        const isSecondary = Math.random() > 0.4;
        const mesh = new THREE.Mesh(this.fireGeo, isSecondary ? this.secondaryFireMat : this.fireMat);

        // Scale fire based on intensity
        mesh.scale.setScalar(0.6 + intensity * 0.6);
        mesh.position.set(
            x + (Math.random() - 0.5) * 0.2,
            y,
            z + (Math.random() - 0.5) * 0.2
        );

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.02,
            0.04 + Math.random() * 0.04,
            (Math.random() - 0.5) * 0.02
        );

        // Random slight rotation
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        group.add(mesh);
        
        // Fire life set to half of smoke (~1.0-1.5s -> ~0.5-0.75s)
        const life = 0.5 + Math.random() * 0.25;
        this.particles.push({
            mesh,
            velocity,
            life: life,
            maxLife: life,
            isSmoke: false,
            isFire: true,
            group
        });
    }

    public addEmitter(x: number, y: number, z: number, hasFire: boolean, group: THREE.Object3D, color?: string, intensity: number = 1.0, id?: string) {
        const emitterColor = color || this.blackSmokeMat.color.getStyle();
        // If ID exists and already present, skip to preserve original (user requirement "sections remain as-is")
        if (id && this.emitters.some(e => e.id === id)) return;
        this.emitters.push({ x, y, z, color: emitterColor, hasFire, nextSpawn: 0, group, intensity, id });
    }

    public updateEmittersByIdPrefix(prefix: string, intensity: number) {
        for (const emitter of this.emitters) {
            if (emitter.id && emitter.id.startsWith(prefix)) {
                emitter.intensity = intensity;
            }
        }
    }

    public update() {
        const now = Date.now();
        for (const emitter of this.emitters) {
            if (now > emitter.nextSpawn) {
                if (emitter.hasFire) {
                    this.spawnFire(emitter.x, emitter.y, emitter.z, emitter.group, emitter.intensity);
                    this.spawnSmoke(emitter.x, emitter.y + 0.2, emitter.z, emitter.color, emitter.group, emitter.intensity);
                    // Spawn frequency scales with intensity
                    emitter.nextSpawn = now + (150 / emitter.intensity);
                } else {
                    this.spawnSmoke(emitter.x, emitter.y, emitter.z, emitter.color, emitter.group, emitter.intensity);
                    emitter.nextSpawn = now + (200 / emitter.intensity);
                }
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.mesh.position.add(p.velocity);

            if (p.isSmoke) {
                // Smoke drifts and expands slightly, and rises
                p.mesh.scale.addScalar(0.005); // Slower expansion
                // add slight wind/wobble
                p.velocity.x += (Math.random() - 0.5) * 0.001;
                p.velocity.z += (Math.random() - 0.5) * 0.001;

                // Gradual transparency fade
                if (p.mesh.material instanceof THREE.MeshStandardMaterial) {
                    p.mesh.material.opacity = (p.life / p.maxLife) * 0.8;
                }
            } else if (p.isFire) {
                // Fire rises and flickers
                p.mesh.scale.multiplyScalar(0.96);
                p.velocity.x += (Math.random() - 0.5) * 0.005;
                p.velocity.z += (Math.random() - 0.5) * 0.005;

                // Randomly pulsate emissive intensity for flicker
                if (p.mesh.material instanceof THREE.MeshStandardMaterial) {
                    p.mesh.material.emissiveIntensity = 1.0 + Math.random() * 2.0;
                }
            } else {
                // Gravity for explosion/splash pieces
                p.velocity.y -= 0.005;
            }

            // Rotate
            p.mesh.rotation.x += 0.05;
            p.mesh.rotation.y += 0.05;

            p.life -= 0.016;

            // Scale down at end of life
            if (p.life < p.maxLife * 0.3) {
                p.mesh.scale.multiplyScalar(0.9);
            }

            if (p.life <= 0 || p.mesh.position.y < -3) { // Use -3 to avoid premature removal during sinking
                p.group.remove(p.mesh);

                // Dispose cloned material for smoke
                if (p.isSmoke && p.mesh.material instanceof THREE.Material) {
                    p.mesh.material.dispose();
                }

                // Swap-and-pop instead of splice for performance
                const lastIndex = this.particles.length - 1;
                if (i !== lastIndex) {
                    this.particles[i] = this.particles[lastIndex];
                }
                this.particles.pop();
            }
        }
    }
}
