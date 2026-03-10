import * as THREE from 'three';

interface Particle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    isSmoke: boolean;
    group: THREE.Object3D;
}

export class ParticleSystem {
    private particles: Particle[] = [];
    private emitters: { x: number, y: number, z: number, isBlack: boolean, nextSpawn: number, group: THREE.Object3D }[] = [];
    
    private explosionGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    private smokeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    
    // Materials
    private fireMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff0000, roughness: 0.4 });
    private greySmokeMat = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.8 });
    private blackSmokeMat = new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.9 });
    
    constructor() {}
    
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
    
    public spawnSmoke(x: number, y: number, z: number, isBlack: boolean, group: THREE.Object3D) {
        const mesh = new THREE.Mesh(this.smokeGeo, isBlack ? this.blackSmokeMat : this.greySmokeMat);
        
        mesh.position.set(
            x + (Math.random() - 0.5) * 0.3,
            y,
            z + (Math.random() - 0.5) * 0.3
        );
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.01,
            0.02 + Math.random() * 0.02,
            (Math.random() - 0.5) * 0.01
        );
        
        // Random slight rotation
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        
        group.add(mesh);
        
        const life = 2.0 + Math.random(); // 2-3 seconds
        this.particles.push({
            mesh,
            velocity,
            life: life,
            maxLife: life,
            isSmoke: true,
            group
        });
    }
    
    public addEmitter(x: number, y: number, z: number, isBlack: boolean, group: THREE.Object3D) {
        this.emitters.push({ x, y, z, isBlack, nextSpawn: 0, group });
    }
    
    public update() {
        const now = Date.now();
        for (const emitter of this.emitters) {
            if (now > emitter.nextSpawn) {
                this.spawnSmoke(emitter.x, emitter.y, emitter.z, emitter.isBlack, emitter.group);
                emitter.nextSpawn = now + (emitter.isBlack ? 300 : 700); // Black smoke is thicker/faster
            }
        }
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            p.mesh.position.add(p.velocity);
            
            if (p.isSmoke) {
                // Smoke drifts and expands slightly, and rises
                p.mesh.scale.addScalar(0.01);
                // add slight wind/wobble
                p.velocity.x += (Math.random() - 0.5) * 0.002;
                p.velocity.z += (Math.random() - 0.5) * 0.002;
            } else {
                // Gravity for explosion pieces
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
            
            if (p.life <= 0 || p.mesh.position.y < -1) {
                p.group.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }
    }
}
