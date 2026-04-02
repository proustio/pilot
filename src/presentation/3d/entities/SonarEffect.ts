import * as THREE from 'three';

export class SonarEffect {
    private mesh: THREE.Mesh;
    private maxRadius: number;
    private duration: number;
    private time: number = 0;
    private isComplete: boolean = false;

    public isActive(): boolean {
        return !this.isComplete;
    }

    constructor(x: number, z: number, radius: number, parent: THREE.Group) {
        this.maxRadius = radius;
        this.duration = 1.5;

        const geometry = new THREE.RingGeometry(0.1, 0.2, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0x4169E1,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(x, 0.1, z);
        parent.add(this.mesh);
    }

    public update(dt: number): boolean {
        this.time += dt;
        const progress = this.time / this.duration;

        if (progress >= 1.0) {
            this.isComplete = true;
            this.mesh.parent?.remove(this.mesh);
            (this.mesh.material as THREE.Material).dispose();
            this.mesh.geometry.dispose();
            return false;
        }

        const currentRadius = progress * this.maxRadius;
        this.mesh.scale.set(currentRadius * 5, currentRadius * 5, 1); // RingGeometry is 1 unit wide
        (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1.0 - progress);

        return true;
    }

    public dispose() {
        this.mesh.parent?.remove(this.mesh);
        (this.mesh.material as THREE.Material).dispose();
        this.mesh.geometry.dispose();
    }
}
