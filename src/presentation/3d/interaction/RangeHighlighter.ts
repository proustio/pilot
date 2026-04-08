import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';

/**
 * Handles move highlight, vision range, and attack range highlight
 * mesh building for Rogue mode.
 *
 * Uses pre-allocated InstancedMesh pools (one per highlight type) to
 * minimize draw calls. Unused instances are hidden via zero-scale matrices.
 */
export class RangeHighlighter {
    public moveHighlightGroup: THREE.Group;
    public visionHighlightGroup: THREE.Group;
    public attackHighlightGroup: THREE.Group;

    private readonly maxCells: number;

    private moveInstancedMesh: THREE.InstancedMesh;
    private visionInstancedMesh: THREE.InstancedMesh;
    private attackInstancedMesh: THREE.InstancedMesh;

    private readonly zeroMatrix: THREE.Matrix4;

    // Reusable temporaries to avoid per-frame allocation
    private readonly _tempMatrix = new THREE.Matrix4();
    private readonly _tempQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, 0)
    );

    constructor(highlightParent: THREE.Object3D) {
        this.maxCells = Config.board.width * Config.board.height;
        this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

        // --- Move highlight pool ---
        this.moveHighlightGroup = new THREE.Group();
        this.moveHighlightGroup.renderOrder = 998;
        this.moveHighlightGroup.visible = false;
        highlightParent.add(this.moveHighlightGroup);

        const moveMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false
        });
        const moveGeo = new THREE.PlaneGeometry(0.9, 0.9);
        this.moveInstancedMesh = new THREE.InstancedMesh(
            moveGeo, moveMat, this.maxCells
        );
        this.moveInstancedMesh.renderOrder = 999;
        this.initPool(this.moveInstancedMesh);
        this.moveHighlightGroup.add(this.moveInstancedMesh);

        // --- Vision highlight pool ---
        this.visionHighlightGroup = new THREE.Group();
        this.visionHighlightGroup.renderOrder = 997;
        highlightParent.add(this.visionHighlightGroup);

        const visionMat = new THREE.MeshBasicMaterial({
            color: 0x4169E1,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const rangeGeo = new THREE.PlaneGeometry(0.95, 0.95);
        this.visionInstancedMesh = new THREE.InstancedMesh(
            rangeGeo, visionMat, this.maxCells
        );
        this.initPool(this.visionInstancedMesh);
        this.visionHighlightGroup.add(this.visionInstancedMesh);

        // --- Attack highlight pool ---
        this.attackHighlightGroup = new THREE.Group();
        this.attackHighlightGroup.renderOrder = 996;
        highlightParent.add(this.attackHighlightGroup);

        const attackMat = new THREE.MeshBasicMaterial({
            color: 0xFFA500,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.attackInstancedMesh = new THREE.InstancedMesh(
            rangeGeo.clone(), attackMat, this.maxCells
        );
        this.initPool(this.attackInstancedMesh);
        this.attackHighlightGroup.add(this.attackInstancedMesh);
    }

    /** Zero all instance matrices so every slot starts hidden. */
    private initPool(mesh: THREE.InstancedMesh): void {
        for (let i = 0; i < mesh.count; i++) {
            mesh.setMatrixAt(i, this.zeroMatrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    }

    public rebuildMoveHighlight(ship: any, board: any): void {
        const boardOffset = Config.board.width / 2;
        const moves = ship.movesRemaining;
        let slotIndex = 0;

        for (let x = 0; x < board.width; x++) {
            for (let z = 0; z < board.height; z++) {
                const dx = Math.abs(x - ship.headX);
                const dz = Math.abs(z - ship.headZ);
                if (dx + dz > 0 && dx + dz <= moves) {
                    const targetX = x - boardOffset + 0.5;
                    const targetZ = z - boardOffset + 0.5;
                    this._tempMatrix.compose(
                        new THREE.Vector3(targetX, 0.2, targetZ),
                        this._tempQuat,
                        new THREE.Vector3(1, 1, 1)
                    );
                    this.moveInstancedMesh.setMatrixAt(slotIndex, this._tempMatrix);
                    slotIndex++;
                }
            }
        }

        // Zero remaining slots
        for (let i = slotIndex; i < this.maxCells; i++) {
            this.moveInstancedMesh.setMatrixAt(i, this.zeroMatrix);
        }
        this.moveInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    public rebuildRangeHighlights(ship: any, board: any): void {
        if (!ship || !ship.isPlaced) {
            this.clearPool(this.visionInstancedMesh);
            this.clearPool(this.attackInstancedMesh);
            return;
        }

        const boardOffset = Config.board.width / 2;
        const visionRadius = ship.visionRadius || 5;
        const attackRadius = visionRadius * 2;

        let visionSlot = 0;
        let attackSlot = 0;

        for (let x = 0; x < board.width; x++) {
            for (let z = 0; z < board.height; z++) {
                const dist = Math.abs(x - ship.headX) + Math.abs(z - ship.headZ);

                if (dist > 0 && dist <= attackRadius) {
                    const targetX = x - boardOffset + 0.5;
                    const targetZ = z - boardOffset + 0.5;
                    this._tempMatrix.compose(
                        new THREE.Vector3(targetX, 0.15, targetZ),
                        this._tempQuat,
                        new THREE.Vector3(1, 1, 1)
                    );

                    if (dist <= visionRadius) {
                        this.visionInstancedMesh.setMatrixAt(visionSlot, this._tempMatrix);
                        visionSlot++;
                    } else {
                        this.attackInstancedMesh.setMatrixAt(attackSlot, this._tempMatrix);
                        attackSlot++;
                    }
                }
            }
        }

        // Zero remaining slots
        for (let i = visionSlot; i < this.maxCells; i++) {
            this.visionInstancedMesh.setMatrixAt(i, this.zeroMatrix);
        }
        for (let i = attackSlot; i < this.maxCells; i++) {
            this.attackInstancedMesh.setMatrixAt(i, this.zeroMatrix);
        }

        this.visionInstancedMesh.instanceMatrix.needsUpdate = true;
        this.attackInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    public hideAll(): void {
        this.moveHighlightGroup.visible = false;
        this.visionHighlightGroup.visible = false;
        this.attackHighlightGroup.visible = false;
    }

    public dispose(): void {
        this.disposeInstancedMesh(this.moveInstancedMesh);
        this.disposeInstancedMesh(this.visionInstancedMesh);
        this.disposeInstancedMesh(this.attackInstancedMesh);
    }

    private clearPool(mesh: THREE.InstancedMesh): void {
        for (let i = 0; i < mesh.count; i++) {
            mesh.setMatrixAt(i, this.zeroMatrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    }

    private disposeInstancedMesh(mesh: THREE.InstancedMesh): void {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
        } else {
            (mesh.material as THREE.Material).dispose();
        }
    }
}
