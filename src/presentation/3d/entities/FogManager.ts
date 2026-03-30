import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';
import { Ship } from '../../../domain/fleet/Ship';
import { FogVisibility } from './FogVisibility';

export class FogManager {
    private fogMeshes: (THREE.InstancedMesh | null)[];
    private enemyBoardGroup: THREE.Group;
    public rogueMode: boolean;
    private fogDirty: boolean = true;
    private fogGeo?: THREE.BufferGeometry;
    private fogMatProto?: THREE.Material;
    private visibility: FogVisibility;

    // Phase 2: Consolidated fog mesh fields
    private consolidatedFogMesh: THREE.InstancedMesh | null = null;
    private rogueVoxelsPerCell: number = 60;
    private maxFogCapacity: number = 0;

    constructor(enemyBoardGroup: THREE.Group, rogueMode: boolean = false) {
        this.enemyBoardGroup = enemyBoardGroup;
        this.rogueMode = rogueMode;
        this.visibility = new FogVisibility(rogueMode);
        const w = Config.board.width;
        this.fogMeshes = new Array(w * w).fill(null);
    }

    public initializeDynamicAssets(geo: THREE.BufferGeometry, mat: THREE.Material) {
        this.fogGeo = geo;
        this.fogMatProto = mat;
    }

    /**
     * Creates a single consolidated InstancedMesh for all Rogue fog voxels.
     */
    public initConsolidatedFog(parentGroup: THREE.Group): void {
        if (!this.fogGeo || !this.fogMatProto) return;

        const boardWidth = Config.board.width;
        const boardHeight = Config.board.height;
        this.maxFogCapacity = boardWidth * boardHeight * this.rogueVoxelsPerCell;

        const consolidatedGeo = this.fogGeo.clone();

        const totalInstances = this.maxFogCapacity;
        const aBasePos = new Float32Array(totalInstances * 3);
        const aScale = new Float32Array(totalInstances);
        const aPhase = new Float32Array(totalInstances);
        const aSpeed = new Float32Array(totalInstances);

        for (let cell = 0; cell < boardWidth * boardHeight; cell++) {
            for (let j = 0; j < this.rogueVoxelsPerCell; j++) {
                const idx = cell * this.rogueVoxelsPerCell + j;
                aBasePos[idx * 3 + 0] = (Math.random() - 0.5) * 0.95;
                aBasePos[idx * 3 + 1] = (Math.random() - 0.5) * 0.45;
                aBasePos[idx * 3 + 2] = (Math.random() - 0.5) * 0.95;
                aScale[idx] = 1.0 + Math.random() * 0.8;
                aPhase[idx] = Math.random() * Math.PI * 2;
                aSpeed[idx] = 0.5 + Math.random() * 1.5;
            }
        }

        consolidatedGeo.setAttribute('aBasePos', new THREE.InstancedBufferAttribute(aBasePos, 3));
        consolidatedGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
        consolidatedGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
        consolidatedGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(aSpeed, 1));

        const mesh = new THREE.InstancedMesh(consolidatedGeo, this.fogMatProto, totalInstances);
        mesh.count = 0;
        mesh.userData = { isFog: true, isConsolidated: true };

        parentGroup.add(mesh);
        this.consolidatedFogMesh = mesh;
    }

    public setFogMesh(index: number, mesh: THREE.InstancedMesh) {
        this.fogMeshes[index] = mesh;
    }

    public getFogMesh(index: number): THREE.Mesh | null {
        return this.fogMeshes[index];
    }

    /**
     * Immediately removes the fog mesh for the given enemy-board cell.
     */
    public clearFogCell(x: number, z: number) {
        if (this.rogueMode) {
            this.fogDirty = true;
            return;
        }
        const fogIdx = getIndex(x, z, Config.board.width);
        const fogMesh = this.fogMeshes[fogIdx];
        if (fogMesh) {
            this.enemyBoardGroup.remove(fogMesh);
            this.fogMeshes[fogIdx] = null;
        }
    }

    /**
     * Removes fog at a given flat index (used by projectile landing).
     */
    public clearFogByIndex(fogIdx: number) {
        if (this.rogueMode) {
            this.fogDirty = true;
            return;
        }
        const fogMesh = this.fogMeshes[fogIdx];
        if (fogMesh) {
            this.enemyBoardGroup.remove(fogMesh);
            this.fogMeshes[fogIdx] = null;
        }
    }

    public setParent(newParent: THREE.Group) {
        this.enemyBoardGroup = newParent;
    }

    /**
     * Animates all fog voxel clouds (bobbing, rotation).
     */
    public updateAnimation(time: number, _camera: THREE.Camera) {
        if (this.rogueMode && this.fogMatProto) {
            if (this.fogMatProto.userData.shader) {
                this.fogMatProto.userData.shader.uniforms.uFogTime.value = time;
            }
            return;
        }

        const firstMesh = this.fogMeshes.find(m => m !== null);
        if (firstMesh) {
            const material = (firstMesh as THREE.Mesh).material as THREE.Material;
            if (material.userData.shader) {
                material.userData.shader.uniforms.uFogTime.value = time;
            }
        }
    }

    public setSetupPhase(isSetup: boolean) {
        this.visibility.setSetupPhase(isSetup);
        this.fogDirty = true;
    }

    public revealCellTemporarily(x: number, z: number, duration: number = 2) {
        this.visibility.revealCellTemporarily(x, z, duration);
        this.fogDirty = true;
    }

    public revealCellPermanently(x: number, z: number) {
        this.visibility.revealCellPermanently(x, z);
        this.fogDirty = true;
    }

    public onTurnChange() {
        this.visibility.onTurnChange();
        this.fogDirty = true;
    }

    public markFogDirty(): void {
        this.fogDirty = true;
    }

    public isFogDirty(): boolean {
        return this.fogDirty;
    }

    public updateRogueFog(shipsOnBoard: Ship[]) {
        if (!this.rogueMode) return;
        if (!this.fogDirty) return;
        this.visibility.setInitialized(true);

        const boardWidth = Config.board.width;
        const boardHeight = Config.board.height;
        const offset = boardWidth / 2;

        // Get all cell coordinates occupied by any ship
        const shipCells: { x: number, z: number, ship: Ship, segmentIndex: number }[] = [];
        for (const ship of shipsOnBoard) {
            const coords = ship.getOccupiedCoordinates();
            for (let i = 0; i < coords.length; i++) {
                shipCells.push({ x: coords[i].x, z: coords[i].z, ship, segmentIndex: i });
            }
        }

        // Update ship vision for isCellRevealed queries
        this.visibility.setLastShipsOnBoard(shipsOnBoard);

        // Rebuild consolidated mesh instances
        const mat4 = new THREE.Matrix4();
        let instanceIdx = 0;

        for (let z = 0; z < boardHeight; z++) {
            for (let x = 0; x < boardWidth; x++) {
                const fogIdx = z * boardWidth + x;
                const targetOpacity = this.visibility.computeCellOpacity(x, z, fogIdx, shipCells);

                // For consolidated mesh: include voxels for fogged cells only
                if (this.consolidatedFogMesh && targetOpacity > 0.01) {
                    const worldX = x - offset + 0.5;
                    const worldZ = z - offset + 0.5;

                    for (let j = 0; j < this.rogueVoxelsPerCell; j++) {
                        mat4.makeTranslation(worldX, 0, worldZ);
                        this.consolidatedFogMesh.setMatrixAt(instanceIdx, mat4);
                        instanceIdx++;
                    }
                }
            }
        }

        // Update consolidated mesh instance count and flag for GPU upload
        if (this.consolidatedFogMesh) {
            this.consolidatedFogMesh.count = instanceIdx;
            this.consolidatedFogMesh.instanceMatrix.needsUpdate = true;
        }

        this.fogDirty = false;
    }

    public isCellRevealed(x: number, z: number): boolean {
        return this.visibility.isCellRevealed(x, z, () => {
            // Classic/Fallback: Check mesh opacity
            const boardWidth = Config.board.width;
            const fogIdx = z * boardWidth + x;
            const fogMesh = this.fogMeshes[fogIdx];
            if (!fogMesh) return true;
            const mat = (fogMesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
            return mat.opacity < 0.2;
        });
    }

    private createFogMesh(x: number, z: number): THREE.InstancedMesh | null {
        if (!this.fogGeo || !this.fogMatProto) return null;

        const boardWidth = Config.board.width;
        const offset = boardWidth / 2;
        const worldX = x - offset + 0.5;
        const worldZ = z - offset + 0.5;

        const numVoxels = 250;
        let mat = this.fogMatProto;
        let ownsMaterial = false;

        if (this.rogueMode) {
            mat = this.fogMatProto.clone();
            mat.transparent = true;
            mat.opacity = 0;
            if (this.fogMatProto.onBeforeCompile) mat.onBeforeCompile = this.fogMatProto.onBeforeCompile;
            ownsMaterial = true;
        }

        const fogMesh = new THREE.InstancedMesh(this.fogGeo, mat, numVoxels);
        fogMesh.position.set(worldX, 0.0, worldZ);

        const identity = new THREE.Matrix4();
        for (let i = 0; i < numVoxels; i++) {
            fogMesh.setMatrixAt(i, identity);
        }

        fogMesh.userData = { isFog: true, ownsMaterial };
        return fogMesh;
    }

    public reset() {
        // Dispose consolidated fog mesh (Rogue mode Phase 2)
        if (this.consolidatedFogMesh) {
            this.consolidatedFogMesh.parent?.remove(this.consolidatedFogMesh);
            this.consolidatedFogMesh.geometry.dispose();
            this.consolidatedFogMesh = null;
        }

        this.fogMeshes.forEach(mesh => {
            if (mesh) {
                mesh.parent?.remove(mesh);
                if (mesh.userData.ownsMaterial) {
                    (mesh.material as THREE.Material).dispose();
                }
            }
        });

        const w = Config.board.width;
        this.fogMeshes = new Array(w * w).fill(null);
        this.visibility.reset();
        this.fogDirty = true;

        // For Classic/Russian modes, re-instantiate the static fog immediately
        if (!this.rogueMode && this.fogGeo && this.fogMatProto) {
            for (let z = 0; z < w; z++) {
                for (let x = 0; x < w; x++) {
                    const mesh = this.createFogMesh(x, z);
                    if (mesh) {
                        this.enemyBoardGroup.add(mesh);
                        this.fogMeshes[z * w + x] = mesh;
                    }
                }
            }
        }
    }
}