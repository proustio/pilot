import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';
import { Ship } from '../../../domain/fleet/Ship';

export class FogManager {
    private fogMeshes: (THREE.InstancedMesh | null)[];
    private isInitialized: boolean = false;
    private enemyBoardGroup: THREE.Group;
    public rogueMode: boolean;
    private fogDirty: boolean = true;
    private isSetupPhase: boolean = false;
    private fogGeo?: THREE.BufferGeometry;
    private fogMatProto?: THREE.Material;

    // Phase 2: Consolidated fog mesh fields
    private consolidatedFogMesh: THREE.InstancedMesh | null = null;
    private rogueVoxelsPerCell: number = 60;
    private maxFogCapacity: number = 0;

    constructor(enemyBoardGroup: THREE.Group, rogueMode: boolean = false) {
        this.enemyBoardGroup = enemyBoardGroup;
        this.rogueMode = rogueMode;
        // fogMeshes array will be dynamically resized for 20x20 in rogue mode.
        // Wait, Config.board.width is correct at instantiate time now.
        const w = Config.board.width;
        this.fogMeshes = new Array(w * w).fill(null);
    }

    public initializeDynamicAssets(geo: THREE.BufferGeometry, mat: THREE.Material) {
        this.fogGeo = geo;
        this.fogMatProto = mat;
    }

    /**
     * Creates a single consolidated InstancedMesh for all Rogue fog voxels.
     * Replaces the per-cell mesh architecture with one draw call for all fog.
     */
    public initConsolidatedFog(parentGroup: THREE.Group): void {
        if (!this.fogGeo || !this.fogMatProto) return;

        const boardWidth = Config.board.width;
        const boardHeight = Config.board.height;
        this.maxFogCapacity = boardWidth * boardHeight * this.rogueVoxelsPerCell;

        // Create a dedicated geometry for the consolidated mesh with per-instance attributes
        const consolidatedGeo = this.fogGeo.clone();

        // Pre-generate per-instance attributes for all potential voxels
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

        // Use fogMatProto directly — no clone — single material = single draw call
        const mesh = new THREE.InstancedMesh(consolidatedGeo, this.fogMatProto, totalInstances);
        mesh.count = 0; // No visible instances initially
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
     * Used when restoring game state from a save, so previously-revealed cells
     * are visible instantly without waiting for projectile animations.
     */
    public clearFogCell(x: number, z: number) {
        if (this.rogueMode) {
            // Consolidated mesh: mark dirty so next updateRogueFog() rebuilds without this cell
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
            // Consolidated mesh: mark dirty so next updateRogueFog() rebuilds without this cell
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
        // In Rogue mode, the consolidated mesh uses fogMatProto directly (no clone),
        // so we can update the uniform on the prototype's compiled shader.
        if (this.rogueMode && this.fogMatProto) {
            if (this.fogMatProto.userData.shader) {
                this.fogMatProto.userData.shader.uniforms.uFogTime.value = time;
            }
            return;
        }

        // Classic mode: find any existing fog mesh to access the shared material's shader
        const firstMesh = this.fogMeshes.find(m => m !== null);
        if (firstMesh) {
            const material = (firstMesh as THREE.Mesh).material as THREE.Material;
            if (material.userData.shader) {
                material.userData.shader.uniforms.uFogTime.value = time;
            }
        }
    }

    /**
     * Updates dynamic fog based on ship proximities in Rogue mode.
     * Computes Chebyshev distance from each cell to nearest ship.
     * Fades in outside radius, fades out inside radius.
     */
    public setSetupPhase(isSetup: boolean) {
        this.isSetupPhase = isSetup;
        this.fogDirty = true;
    }

    private temporarilyRevealedCells: Map<number, number> = new Map();
    private permanentlyRevealedCells: Set<number> = new Set();
    private lastShipsOnBoard: Ship[] | null = null;

    public revealCellTemporarily(x: number, z: number, duration: number = 2) {
        const boardWidth = Config.board.width;
        const index = z * boardWidth + x;
        this.temporarilyRevealedCells.set(index, duration);
        this.fogDirty = true;
    }

    public revealCellPermanently(x: number, z: number) {
        const boardWidth = Config.board.width;
        const index = z * boardWidth + x;
        this.permanentlyRevealedCells.add(index);
        this.fogDirty = true;
    }

    public onTurnChange() {
        // Decrement all temporary reveals
        for (const [index, duration] of this.temporarilyRevealedCells.entries()) {
            if (duration <= 1) {
                this.temporarilyRevealedCells.delete(index);
            } else {
                this.temporarilyRevealedCells.set(index, duration - 1);
            }
        }
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
        this.isInitialized = true;

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

        // Update ship vision for legal checks
        this.lastShipsOnBoard = shipsOnBoard;

        // Rebuild consolidated mesh instances
        const mat4 = new THREE.Matrix4();
        let instanceIdx = 0;

        for (let z = 0; z < boardHeight; z++) {
            for (let x = 0; x < boardWidth; x++) {
                const fogIdx = z * boardWidth + x;

                let minDist = Infinity;
                for (const cell of shipCells) {
                    if (cell.ship.isEnemy) continue; // Only player units reveal fog

                    const dx = Math.abs(cell.x - x);
                    const dz = Math.abs(cell.z - z);
                    const dist = Math.max(dx, dz); // Chebyshev

                    // Normalize distance by vision radius (dist / visionRadius)
                    const normalizedDist = dist / cell.ship.visionRadius;
                    if (normalizedDist < minDist) {
                        minDist = normalizedDist;
                    }
                }

                let targetOpacity = 0.85;

                // Rule 1: Radius-based fog around ships
                if (minDist <= 1.0) {
                    targetOpacity = 0.0;
                }

                // Rule 2: During setup, reveal player quadrant (0-6, 0-6)
                if (this.isSetupPhase && x < 7 && z < 7) {
                    targetOpacity = 0.0;
                }

                // Rule 3: Temporary reveals from attacks
                if (this.temporarilyRevealedCells.has(fogIdx)) {
                    targetOpacity = 0.0;
                }

                // Rule 4: Permanent reveals (e.g. sunk ships)
                if (this.permanentlyRevealedCells.has(fogIdx)) {
                    targetOpacity = 0.0;
                }

                // Rule 5: Reveal fog on any sunk ships or hit segments
                for (const cell of shipCells) {
                    if (cell.x === x && cell.z === z) {
                        const isSunk = cell.ship.isSunk();
                        const isHit = cell.ship.segments[cell.segmentIndex] === false;
                        if (isSunk || isHit) {
                            targetOpacity = 0.0;
                            break;
                        }
                    }
                }

                // For consolidated mesh: include voxels for fogged cells only
                if (this.consolidatedFogMesh && targetOpacity > 0.01) {
                    const worldX = x - offset + 0.5;
                    const worldZ = z - offset + 0.5;

                    // Set instance matrices for this cell's voxels, translating to cell world position.
                    // aBasePos attribute provides local voxel offset within the cell.
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
        // In Rogue mode, if not yet initialized, nothing is revealed
        if (this.rogueMode && !this.isInitialized) return false;

        const boardWidth = Config.board.width;
        const fogIdx = z * boardWidth + x;

        // Permanent and temporary (ping) reveals are always true
        if (this.permanentlyRevealedCells.has(fogIdx)) return true;
        if (this.temporarilyRevealedCells.has(fogIdx)) return true;

        if (this.rogueMode) {
            // Check if within any player ship's vision radius
            if (this.lastShipsOnBoard) {
                for (const ship of this.lastShipsOnBoard) {
                    if (ship.isEnemy || ship.isSunk()) continue;
                    const coords = ship.getOccupiedCoordinates();
                    for (const c of coords) {
                        const dx = Math.abs(c.x - x);
                        const dz = Math.abs(c.z - z);
                        if (Math.max(dx, dz) <= ship.visionRadius) return true;
                    }
                }
            }

            // Check if specific ship segment is hit or sunk at this location
            if (this.lastShipsOnBoard) {
                for (const ship of this.lastShipsOnBoard) {
                    const coords = ship.getOccupiedCoordinates();
                    for (let i = 0; i < coords.length; i++) {
                        if (coords[i].x === x && coords[i].z === z) {
                            if (ship.isSunk() || ship.segments[i] === false) return true;
                        }
                    }
                }
            }

            // Setup phase reveal
            if (this.isSetupPhase && x < 7 && z < 7) return true;

            // In Rogue mode, no per-cell fog meshes exist — cell is fogged by default
            return false;
        }

        // Classic/Fallback: Check mesh opacity
        const fogMesh = this.fogMeshes[fogIdx];
        if (!fogMesh) return true;
        const mat = (fogMesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
        return mat.opacity < 0.2;
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
        this.temporarilyRevealedCells.clear();
        this.permanentlyRevealedCells.clear();
        this.isInitialized = false;
        this.fogDirty = true;

        // For Classic/Russian modes, we re-instantiate the static fog immediately
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
