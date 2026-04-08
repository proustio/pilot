import * as THREE from 'three';

export interface TurretTransform {
    localPosition: THREE.Vector3;
    barrelOffset: THREE.Vector3;
    barrelRotation: THREE.Euler;
}

const TURRET_CAPACITY = 64;

/**
 * Manages shared InstancedMesh pools for turret bases and barrels across all ships.
 * Reduces draw calls from 2×N (N turrets) to exactly 2 (one for bases, one for barrels).
 */
export class TurretInstanceManager {
    private baseMesh: THREE.InstancedMesh;
    private barrelMesh: THREE.InstancedMesh;
    private shipSlots: Map<string, { baseSlots: number[]; barrelSlots: number[] }> = new Map();
    private freeSlots: number[] = [];
    private readonly capacity: number;
    private readonly zeroMatrix: THREE.Matrix4;

    // Store local transforms per slot for updateTransform recomputation
    private slotLocalBaseMatrix: Map<number, THREE.Matrix4> = new Map();
    private slotLocalBarrelMatrix: Map<number, THREE.Matrix4> = new Map();

    constructor(parentGroup: THREE.Object3D, isPlayer: boolean) {
        this.capacity = TURRET_CAPACITY;

        // Pre-fill free slots (high→low so pop gives lowest first)
        for (let i = this.capacity - 1; i >= 0; i--) {
            this.freeSlots.push(i);
        }

        this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

        // Compute colors with player/enemy inversion
        let turretBaseColor = new THREE.Color(0x2a2a2a);
        let barrelColor = new THREE.Color(0x555555);
        if (!isPlayer) {
            turretBaseColor = new THREE.Color(
                1 - turretBaseColor.r, 1 - turretBaseColor.g, 1 - turretBaseColor.b
            );
            barrelColor = new THREE.Color(
                1 - barrelColor.r, 1 - barrelColor.g, 1 - barrelColor.b
            );
        }

        const baseMat = new THREE.MeshStandardMaterial({ color: turretBaseColor, roughness: 0.6 });
        const barrelMat = new THREE.MeshStandardMaterial({ color: barrelColor, roughness: 0.5 });

        const baseGeo = new THREE.BoxGeometry(0.15, 0.08, 0.15);
        const barrelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6);

        this.baseMesh = new THREE.InstancedMesh(baseGeo, baseMat, this.capacity);
        this.barrelMesh = new THREE.InstancedMesh(barrelGeo, barrelMat, this.capacity);
        this.baseMesh.castShadow = true;
        this.barrelMesh.castShadow = true;

        // Initialize all slots to zero-scale (hidden)
        for (let i = 0; i < this.capacity; i++) {
            this.baseMesh.setMatrixAt(i, this.zeroMatrix);
            this.barrelMesh.setMatrixAt(i, this.zeroMatrix);
        }
        this.baseMesh.instanceMatrix.needsUpdate = true;
        this.barrelMesh.instanceMatrix.needsUpdate = true;

        parentGroup.add(this.baseMesh);
        parentGroup.add(this.barrelMesh);
    }

    /**
     * Allocates instance slots for a ship's turrets and writes their transforms.
     * Turret transforms are in ship-local space; shipWorldMatrix places them in board space.
     */
    public addTurrets(shipId: string, turretTransforms: TurretTransform[], shipWorldMatrix: THREE.Matrix4): void {
        if (this.shipSlots.has(shipId)) return; // already registered

        const baseSlots: number[] = [];
        const barrelSlots: number[] = [];
        const dummy = new THREE.Object3D();
        const combined = new THREE.Matrix4();

        for (const t of turretTransforms) {
            if (this.freeSlots.length === 0) break; // capacity exhausted — silently skip

            const slot = this.freeSlots.pop()!;
            baseSlots.push(slot);
            barrelSlots.push(slot); // 1:1 mapping — same slot index for base and barrel

            // Base transform (ship-local)
            dummy.position.copy(t.localPosition);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            const baseLocal = dummy.matrix.clone();
            this.slotLocalBaseMatrix.set(slot, baseLocal);
            combined.multiplyMatrices(shipWorldMatrix, baseLocal);
            this.baseMesh.setMatrixAt(slot, combined);

            // Barrel transform (ship-local, offset from base + rotated)
            dummy.position.copy(t.localPosition).add(t.barrelOffset);
            dummy.rotation.copy(t.barrelRotation);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            const barrelLocal = dummy.matrix.clone();
            this.slotLocalBarrelMatrix.set(slot, barrelLocal);
            combined.multiplyMatrices(shipWorldMatrix, barrelLocal);
            this.barrelMesh.setMatrixAt(slot, combined);
        }

        this.shipSlots.set(shipId, { baseSlots, barrelSlots });
        this.baseMesh.instanceMatrix.needsUpdate = true;
        this.barrelMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Zeros instance matrices for a ship's turret slots and returns them to the free pool.
     */
    public removeTurrets(shipId: string): void {
        const slots = this.shipSlots.get(shipId);
        if (!slots) return; // unknown ship — no-op

        for (const slot of slots.baseSlots) {
            this.baseMesh.setMatrixAt(slot, this.zeroMatrix);
            this.barrelMesh.setMatrixAt(slot, this.zeroMatrix);
            this.slotLocalBaseMatrix.delete(slot);
            this.slotLocalBarrelMatrix.delete(slot);
            this.freeSlots.push(slot);
        }

        this.shipSlots.delete(shipId);
        this.baseMesh.instanceMatrix.needsUpdate = true;
        this.barrelMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Recomputes turret instance matrices by combining each turret's local transform
     * with the ship's current local matrix (relative to the board group).
     * Used during sinking animations and ship movement.
     */
    public updateTransform(shipId: string, shipLocalMatrix: THREE.Matrix4): void {
        const slots = this.shipSlots.get(shipId);
        if (!slots) return;

        const combined = new THREE.Matrix4();

        for (const slot of slots.baseSlots) {
            const localBase = this.slotLocalBaseMatrix.get(slot);
            if (localBase) {
                combined.multiplyMatrices(shipLocalMatrix, localBase);
                this.baseMesh.setMatrixAt(slot, combined);
            }

            const localBarrel = this.slotLocalBarrelMatrix.get(slot);
            if (localBarrel) {
                combined.multiplyMatrices(shipLocalMatrix, localBarrel);
                this.barrelMesh.setMatrixAt(slot, combined);
            }
        }

        this.baseMesh.instanceMatrix.needsUpdate = true;
        this.barrelMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Disposes both InstancedMesh geometries and materials. Idempotent.
     */
    public dispose(): void {
        this.baseMesh.geometry.dispose();
        this.barrelMesh.geometry.dispose();
        (this.baseMesh.material as THREE.Material).dispose();
        (this.barrelMesh.material as THREE.Material).dispose();
        this.baseMesh.dispose();
        this.barrelMesh.dispose();

        if (this.baseMesh.parent) this.baseMesh.parent.remove(this.baseMesh);
        if (this.barrelMesh.parent) this.barrelMesh.parent.remove(this.barrelMesh);

        this.shipSlots.clear();
        this.slotLocalBaseMatrix.clear();
        this.slotLocalBarrelMatrix.clear();
        this.freeSlots = [];
    }
}
