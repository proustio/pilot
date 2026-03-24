import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';
import { Ship } from '../../../domain/fleet/Ship';

export class FogManager {
    private fogMeshes: (THREE.InstancedMesh | null)[];
    private isInitialized: boolean = false;
    private enemyBoardGroup: THREE.Group;
    public rogueMode: boolean;
    private isSetupPhase: boolean = false;
    private fogGeo?: THREE.BufferGeometry;
    private fogMatProto?: THREE.Material;

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
        // The vertex shader handles animation. We just need to update the shared material's uniform.
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
    }

    private temporarilyRevealedCells: Map<number, number> = new Map();
    private permanentlyRevealedCells: Set<number> = new Set();

    public revealCellTemporarily(x: number, z: number, duration: number = 2) {
        const boardWidth = Config.board.width;
        const index = z * boardWidth + x;
        this.temporarilyRevealedCells.set(index, duration);
    }

    public revealCellPermanently(x: number, z: number) {
        const boardWidth = Config.board.width;
        const index = z * boardWidth + x;
        this.permanentlyRevealedCells.add(index);
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
    }

    public updateRogueFog(shipsOnBoard: Ship[]) {
        if (!this.rogueMode) return;
        this.isInitialized = true;
        
        const boardWidth = Config.board.width;
        const boardHeight = Config.board.height;

        // Get all cell coordinates occupied by any ship
        const shipCells: {x: number, z: number, ship: Ship}[] = [];
        for (const ship of shipsOnBoard) {
            const coords = ship.getOccupiedCoordinates();
            for (const c of coords) {
                shipCells.push({ x: c.x, z: c.z, ship });
            }
        }

        const lerpFactor = 0.1; 

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
                if (minDist <= 1.0) { // Using normalizedDist, so 1.0 means within radius
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

                // Rule 5: Reveal fog on any sunk ships
                for (const cell of shipCells) {
                    if (cell.ship.isSunk() && cell.x === x && cell.z === z) {
                        targetOpacity = 0.0;
                        break;
                    }
                }

                let fogMesh = this.fogMeshes[fogIdx] as THREE.InstancedMesh;
                
                // If it needs to be visible but doesn't exist, instantiate it
                if (!fogMesh && targetOpacity > 0.01 && this.fogGeo && this.fogMatProto) {
                    const clonedMat = this.fogMatProto.clone();
                    clonedMat.transparent = true;
                    clonedMat.opacity = 0; // start transparent and fade in
                    
                    // IMPORTANT: onBeforeCompile is not cloned by default in Three.js
                    if (this.fogMatProto.onBeforeCompile) {
                        clonedMat.onBeforeCompile = this.fogMatProto.onBeforeCompile;
                    }
                    
                    const numVoxels = 250;
                    fogMesh = new THREE.InstancedMesh(this.fogGeo, clonedMat, numVoxels);
                    
                    const offset = boardWidth / 2;
                    const worldX = x - offset + 0.5;
                    const worldZ = z - offset + 0.5;
                    fogMesh.position.set(worldX, 0.0, worldZ);

                    const identity = new THREE.Matrix4();
                    for (let i = 0; i < numVoxels; i++) {
                        fogMesh.setMatrixAt(i, identity);
                    }
                    
                    fogMesh.userData = { isFog: true, ownsMaterial: true };
                    
                    // Attach to playerBoardGroup (the shared board in Rogue mode)
                    this.enemyBoardGroup.parent?.children[0].add(fogMesh); 
                    this.fogMeshes[fogIdx] = fogMesh;
                }

                if (fogMesh) {
                    const mat = fogMesh.material as THREE.MeshStandardMaterial;
                    mat.opacity += (targetOpacity - mat.opacity) * lerpFactor;
                    
                    if (mat.opacity < 0.01 && targetOpacity === 0.0) {
                        fogMesh.parent?.remove(fogMesh);
                        this.fogMeshes[fogIdx] = null;
                    }
                }
            }
        }
    }

    public isCellRevealed(x: number, z: number): boolean {
        // In Rogue mode, if not yet initialized, nothing is revealed
        if (this.rogueMode && !this.isInitialized) return false;

        const fogIdx = z * Config.board.width + x;
        const fogMesh = this.fogMeshes[fogIdx];
        if (!fogMesh) return true; // No mesh means fully revealed (for Classic) or target opacity was 0 (for Rogue)
        
        const mat = (fogMesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
        return mat.opacity < 0.2; // Treat as revealed if opacity is low
    }
}
