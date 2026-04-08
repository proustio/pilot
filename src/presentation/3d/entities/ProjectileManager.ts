import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem';
import { FogManager } from './FogManager';
import { ImpactEffects } from './ImpactEffects';
import { ProjectileAnimator } from './ProjectileAnimator';
import { Config } from '../../../infrastructure/config/Config';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';

/**
 * Manages projectile (attack marker) creation, replay placement,
 * and marker lifecycle. Delegates per-frame arc animation and
 * landing resolution to ProjectileAnimator.
 */
export class ProjectileManager {
    private fogManager: FogManager;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;
    private impactEffects: ImpactEffects;
    private animator: ProjectileAnimator;

    constructor(
        particleSystem: ParticleSystem,
        fogManager: FogManager,
        playerBoardGroup: THREE.Group,
        enemyBoardGroup: THREE.Group
    ) {
        this.fogManager = fogManager;
        this.playerBoardGroup = playerBoardGroup;
        this.enemyBoardGroup = enemyBoardGroup;
        this.impactEffects = new ImpactEffects(particleSystem, playerBoardGroup, enemyBoardGroup);
        this.animator = new ProjectileAnimator(
            particleSystem, fogManager, playerBoardGroup, enemyBoardGroup, this.impactEffects
        );
    }

    public hasFallingMarkers(): boolean {
        return this.animator.hasFalling();
    }

    /** Delegates per-frame arc animation to ProjectileAnimator. */
    public updateProjectiles(
        addRipple: (worldX: number, worldZ: number, isPlayerBoard: boolean) => void,
        playerWaterUniforms: any, enemyWaterUniforms: any
    ): void {
        this.animator.updateProjectiles(addRipple, playerWaterUniforms, enemyWaterUniforms);
    }

    public clear(): void { this.animator.clearAll(); }

    /**
     * Creates a missile marker, either placing it instantly (replay) or
     * setting up a bezier-curve arc animation.
     */
    public addAttackMarker(
        x: number, z: number, result: string,
        isPlayer: boolean, isReplay: boolean,
        addRipple: (worldX: number, worldZ: number, isPlayerBoard: boolean) => void
    ): void {
        if (!isReplay) {
            AudioEngine.getInstance().playShoot();
        }

        const isRogue = Config.rogueMode;
        const targetGroup = isRogue
            ? this.playerBoardGroup
            : (isPlayer ? this.enemyBoardGroup : this.playerBoardGroup);
        const marker = this.buildMissileModel(result);

        const boardOffset = Config.board.width / 2;
        const worldX = x - boardOffset + 0.5;
        const worldZ = z - boardOffset + 0.5;
        const targetLocalPos = new THREE.Vector3(worldX, 0.4, worldZ);

        // Replay (instant placement)
        if (isReplay) {
            this.placeReplayMarker(
                marker, result, worldX, worldZ, x, z, isPlayer, targetGroup, addRipple
            );
            return;
        }

        // Live Shot Arc
        const startPos = this.computeLaunchPosition(isRogue, isPlayer, targetGroup);
        const midPoint = new THREE.Vector3()
            .addVectors(startPos, targetLocalPos).multiplyScalar(0.5);
        midPoint.y += 5.0;

        const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, targetLocalPos);
        marker.position.copy(startPos);
        targetGroup.add(marker);

        this.animator.addFallingMarker({
            mesh: marker, curve, progress: 0,
            worldX, worldZ, result, isPlayer,
            cellX: x, cellZ: z, isReplayFlag: isReplay
        });
    }

    private buildMissileModel(result: string): THREE.Group {
        const activeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.2, metalness: 0.8, vertexColors: true
        });
        activeMat.emissive.setHex(result === 'hit' || result === 'sunk' ? 0xFF2400 : 0x4169E1);
        activeMat.emissiveIntensity = 2.0;

        const marker = new THREE.Group();
        marker.userData = { originalMat: activeMat, isAttackMarker: true, result };
        const rocketModel = new THREE.Group();
        rocketModel.rotation.x = 25 * Math.PI / 180;
        marker.add(rocketModel);

        const s = 0.05;
        const geo = new THREE.BoxGeometry(s, s, s);
        const voxels = this.buildMissileVoxels(s);

        const im = new THREE.InstancedMesh(geo, activeMat, voxels.length);
        im.castShadow = true;
        const dummy = new THREE.Object3D();
        const white = new THREE.Color(0xffffff);
        const black = new THREE.Color(0x222222);
        voxels.forEach((pos, i) => {
            dummy.position.copy(pos);
            dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix);
            im.setColorAt(i, Math.round(pos.z / s) % 2 === 0 ? black : white);
        });
        rocketModel.add(im);
        marker.userData.instancedMesh = im;
        return marker;
    }

    private buildMissileVoxels(s: number): THREE.Vector3[] {
        const v: THREE.Vector3[] = [];
        for (let mx = -1; mx <= 1; mx++)
            for (let my = -1; my <= 1; my++) {
                if (Math.abs(mx) === 1 && Math.abs(my) === 1) continue;
                for (let mz = 0; mz < 8; mz++) v.push(new THREE.Vector3(mx * s, my * s, mz * s));
            }
        v.push(new THREE.Vector3(0, s, 8 * s), new THREE.Vector3(0, -s, 8 * s));
        v.push(new THREE.Vector3(s, 0, 8 * s), new THREE.Vector3(-s, 0, 8 * s));
        v.push(new THREE.Vector3(0, 0, 8 * s), new THREE.Vector3(0, 0, 9 * s));
        for (let mz = 0; mz < 3; mz++) {
            v.push(new THREE.Vector3(2 * s, 0, mz * s), new THREE.Vector3(-2 * s, 0, mz * s));
            v.push(new THREE.Vector3(0, 2 * s, mz * s), new THREE.Vector3(0, -2 * s, mz * s));
        }
        return v;
    }

    private placeReplayMarker(
        marker: THREE.Group, result: string,
        worldX: number, worldZ: number,
        cellX: number, cellZ: number,
        isPlayer: boolean, targetGroup: THREE.Group,
        addRipple: (wX: number, wZ: number, isPlayerBoard: boolean) => void
    ): void {
        if (marker.userData.instancedMesh) {
            const im = marker.userData.instancedMesh as THREE.InstancedMesh;
            const finalMat = marker.userData.originalMat.clone();
            finalMat.emissive.setHex(0x000000);
            im.material = finalMat;

            const destroyRatio = result === 'hit' || result === 'sunk' ? 0.60 : 0.30;
            const dummyR = new THREE.Object3D();
            for (let j = 0; j < im.count; j++) {
                if (Math.random() < destroyRatio) {
                    im.getMatrixAt(j, dummyR.matrix);
                    dummyR.matrix.decompose(dummyR.position, dummyR.quaternion, dummyR.scale);
                    dummyR.scale.set(0, 0, 0);
                    dummyR.updateMatrix();
                    im.setMatrixAt(j, dummyR.matrix);
                }
            }
            im.instanceMatrix.needsUpdate = true;
        }
        marker.position.set(worldX, 0.4, worldZ);
        if (isPlayer) {
            this.fogManager.clearFogCell(cellX, cellZ);
        }
        targetGroup.add(marker);

        if (result === 'hit' || result === 'sunk') {
            this.impactEffects.applyImpactEffects(cellX, cellZ, result, isPlayer, true, addRipple);
        }
    }

    private computeLaunchPosition(
        isRogue: boolean, isPlayer: boolean, targetGroup: THREE.Group
    ): THREE.Vector3 {
        const sourceGroup = isRogue
            ? this.playerBoardGroup
            : (isPlayer ? this.playerBoardGroup : this.enemyBoardGroup);
        const startPos = new THREE.Vector3(
            (Math.random() - 0.5) * 10, 5, (Math.random() - 0.5) * 10
        );

        const friendlyShips: THREE.Group[] = [];
        sourceGroup.children.forEach((c: THREE.Object3D) => {
            const isFriendly = isRogue
                ? (isPlayer ? !c.userData.isEnemy : c.userData.isEnemy)
                : true;
            if (c.userData.isShip && !c.userData.isSinking && isFriendly) {
                friendlyShips.push(c as THREE.Group);
            }
        });

        if (friendlyShips.length > 0) {
            const ship = friendlyShips[Math.floor(Math.random() * friendlyShips.length)];
            ship.getWorldPosition(startPos);
            targetGroup.worldToLocal(startPos);
        } else {
            startPos.set(0, 10, 0);
        }

        return startPos;
    }
}
