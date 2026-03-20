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
    public updateAnimation(time: number) {
        const fogCloudTime = time * 2.0;
        const dummy = new THREE.Object3D();
        this.fogMeshes.forEach(mesh => {
            if (mesh && mesh.userData.isFog) {
                const im = mesh as THREE.InstancedMesh;
                const vData = mesh.userData.voxelData;
                for (let i = 0; i < im.count; i++) {
                    const data = vData[i];
                    dummy.position.copy(data.basePos);
                    // Slow bobbing
                    dummy.position.y += Math.sin(fogCloudTime * data.speed + data.phase) * 0.1;
                    // Slow rotation
                    dummy.rotation.set(
                        Math.sin(fogCloudTime * 0.5 + data.phase),
                        Math.cos(fogCloudTime * 0.4 + data.phase),
                        Math.sin(fogCloudTime * 0.6 + data.phase)
                    );
                    dummy.updateMatrix();
                    im.setMatrixAt(i, dummy.matrix);
                }
                im.instanceMatrix.needsUpdate = true;
            }
        });
    }
}
