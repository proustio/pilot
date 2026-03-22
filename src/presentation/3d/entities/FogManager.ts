import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';

export class FogManager {
    private fogMeshes: (THREE.Mesh | null)[];
    private enemyBoardGroup: THREE.Group;
    public rogueMode: boolean;

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
    public updateRogueFog(ships: import('../../../domain/fleet/Ship').Ship[]) {
        if (!this.rogueMode) return;
        
        const boardWidth = Config.board.width;
        const boardHeight = Config.board.height;
        const fogRadius = Config.rogue.fogRadius;

        // Get all cell coordinates occupied by any ship
        const shipCells: {x: number, z: number}[] = [];
        for (const ship of ships) {
            shipCells.push(...ship.getOccupiedCoordinates());
        }

        const lerpFactor = 0.1; 

        for (let z = 0; z < boardHeight; z++) {
            for (let x = 0; x < boardWidth; x++) {
                const fogIdx = z * boardWidth + x;
                
                let minDist = Infinity;
                for (const cell of shipCells) {
                    const dx = Math.abs(cell.x - x);
                    const dz = Math.abs(cell.z - z);
                    const dist = Math.max(dx, dz); // Chebyshev
                    if (dist < minDist) minDist = dist;
                }

                const targetOpacity = (minDist <= fogRadius) ? 0.0 : 0.85;

                let fogMesh = this.fogMeshes[fogIdx] as THREE.InstancedMesh;
                
                // If it needs to be visible but doesn't exist, instantiate it
                if (!fogMesh && targetOpacity > 0.01 && this.fogGeo && this.fogMatProto) {
                    const clonedMat = this.fogMatProto.clone();
                    clonedMat.transparent = true;
                    clonedMat.opacity = 0; // start transparent and fade in
                    
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
                    
                    // In Rogue mode, board is shared, usually playerBoardGroup, but we'll attach to enemyBoardGroup
                    // Wait, enemyBoardGroup is flipped upside down (y=-1.2, rotated).
                    // In rogue mode, both share the player board (facing UP)
                    // If we attach it to enemyBoardGroup, it will be upside down unless we attach to the right board.
                    this.enemyBoardGroup.parent?.children[0].add(fogMesh); // Add to playerBoardGroup visually! (masterBoardGroup -> playerBoardGroup)
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
}
