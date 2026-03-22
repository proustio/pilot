import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';

export class FogManager {
    private fogMeshes: (THREE.Mesh | null)[];
    private enemyBoardGroup: THREE.Group;

    constructor(enemyBoardGroup: THREE.Group) {
        this.enemyBoardGroup = enemyBoardGroup;
        this.fogMeshes = new Array(Config.board.width * Config.board.height).fill(null);
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
}
