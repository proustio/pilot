import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { EntityState } from './EntityState';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';
import { getIndex } from '../../../domain/board/BoardUtils';

export class AttackMarkerBuilder {
    private state: EntityState;
    private onApplyImpact: (cellX: number, cellZ: number, result: string, isPlayer: boolean, isReplay: boolean) => void;

    constructor(
        state: EntityState,
        onApplyImpact: (cellX: number, cellZ: number, result: string, isPlayer: boolean, isReplay: boolean) => void
    ) {
        this.state = state;
        this.onApplyImpact = onApplyImpact;
    }

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean = false) {
        if (!isReplay) {
            AudioEngine.getInstance().playShoot();
        }

        const targetGroup = isPlayer ? this.state.enemyBoardGroup : this.state.playerBoardGroup;

        // High-tech glowing projectile (Attack Marker)
        const activeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.2,
            metalness: 0.8,
            vertexColors: true
        });
        const activeGlowColor = result === 'hit' || result === 'sunk' ? 0xFF2400 : 0x4169E1; // Scarlet (hit) vs Royal Blue (miss)
        activeMat.emissive.setHex(activeGlowColor);
        activeMat.emissiveIntensity = 2.0; // intense glow

        const marker = new THREE.Group();
        marker.userData = { originalMat: activeMat, isAttackMarker: true };

        const rocketModel = new THREE.Group();
        rocketModel.rotation.x = 25 * Math.PI / 180;
        marker.add(rocketModel);

        const voxelSize = 0.05;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        const voxels: THREE.Vector3[] = [];

        for (let vx = -1; vx <= 1; vx++) {
            for (let vy = -1; vy <= 1; vy++) {
                if (Math.abs(vx) === 1 && Math.abs(vy) === 1) continue;

                for (let vz = 0; vz < 8; vz++) {
                    voxels.push(new THREE.Vector3(vx * voxelSize, vy * voxelSize, vz * voxelSize));
                }
            }
        }

        voxels.push(new THREE.Vector3(0, voxelSize, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, -voxelSize, 8 * voxelSize));
        voxels.push(new THREE.Vector3(voxelSize, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(-voxelSize, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, 0, 9 * voxelSize));

        for (let vz = 0; vz < 3; vz++) {
            voxels.push(new THREE.Vector3(2 * voxelSize, 0, vz * voxelSize));
            voxels.push(new THREE.Vector3(-2 * voxelSize, 0, vz * voxelSize));
            voxels.push(new THREE.Vector3(0, 2 * voxelSize, vz * voxelSize));
            voxels.push(new THREE.Vector3(0, -2 * voxelSize, vz * voxelSize));
        }

        const instancedMissile = new THREE.InstancedMesh(voxelGeo, activeMat, voxels.length);
        instancedMissile.castShadow = true;

        const dummy = new THREE.Object3D();
        const white = new THREE.Color(0xffffff);
        const black = new THREE.Color(0x222222);

        voxels.forEach((pos, i) => {
            dummy.position.copy(pos);
            dummy.updateMatrix();
            instancedMissile.setMatrixAt(i, dummy.matrix);

            const zIndex = Math.round(pos.z / voxelSize);
            const isBlackStripe = zIndex % 2 === 0;
            instancedMissile.setColorAt(i, isBlackStripe ? black : white);
        });

        rocketModel.add(instancedMissile);
        marker.userData.instancedMesh = instancedMissile;

        const boardOffset = Config.board.width / 2;
        const worldX = x - boardOffset + 0.5;
        const worldZ = z - boardOffset + 0.5;

        const targetLocalPos = new THREE.Vector3(worldX, 0.4, worldZ);

        if (isReplay) {
            if (marker.userData.instancedMesh) {
                const im = marker.userData.instancedMesh as THREE.InstancedMesh;
                const finalMat = marker.userData.originalMat.clone();
                finalMat.emissive.setHex(0x000000);
                im.material = finalMat;

                const destroyRatio = result === 'hit' || result === 'sunk' ? 0.60 : 0.30;
                const dummyReplay = new THREE.Object3D();
                for (let j = 0; j < im.count; j++) {
                    if (Math.random() < destroyRatio) {
                        im.getMatrixAt(j, dummyReplay.matrix);
                        dummyReplay.matrix.decompose(dummyReplay.position, dummyReplay.quaternion, dummyReplay.scale);
                        dummyReplay.scale.set(0, 0, 0);
                        dummyReplay.updateMatrix();
                        im.setMatrixAt(j, dummyReplay.matrix);
                    }
                }
                im.instanceMatrix.needsUpdate = true;
            }
            marker.position.set(worldX, 0.4, worldZ);
            if (isPlayer) {
                this.clearFogCell(x, z);
            }
            targetGroup.add(marker);

            // Restore visual effects (smoke, fire, sinks, voxel holes)
            if (result === 'hit' || result === 'sunk') {
                this.onApplyImpact(x, z, result, isPlayer, true);
            }
            return;
        }

        const sourceGroup = isPlayer ? this.state.playerBoardGroup : this.state.enemyBoardGroup;
        let startPos = new THREE.Vector3((Math.random() - 0.5) * 10, 5, (Math.random() - 0.5) * 10);

        const friendlyShips: THREE.Group[] = [];
        sourceGroup.children.forEach((c: THREE.Object3D) => {
            if (c.userData.isShip && !c.userData.isSinking) friendlyShips.push(c as THREE.Group);
        });

        if (friendlyShips.length > 0) {
            const randomShip = friendlyShips[Math.floor(Math.random() * friendlyShips.length)];
            randomShip.getWorldPosition(startPos);
            targetGroup.worldToLocal(startPos);
        } else {
            startPos.set(0, 10, 0);
        }

        const midPoint = new THREE.Vector3().addVectors(startPos, targetLocalPos).multiplyScalar(0.5);
        midPoint.y += 5.0;

        const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, targetLocalPos);

        marker.position.copy(startPos);
        targetGroup.add(marker);

        this.state.fallingMarkers.push({
            mesh: marker,
            curve: curve,
            progress: 0,
            worldX,
            worldZ,
            result,
            isPlayer,
            cellX: x,
            cellZ: z,
            isReplayFlag: isReplay
        });
    }

    private clearFogCell(x: number, z: number) {
        const fogIdx = getIndex(x, z, Config.board.width);
        const fogMesh = this.state.fogMeshes[fogIdx];
        if (fogMesh) {
            this.state.enemyBoardGroup.remove(fogMesh);
            this.state.fogMeshes[fogIdx] = null;
        }
    }
}
