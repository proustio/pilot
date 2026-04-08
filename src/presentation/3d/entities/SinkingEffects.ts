import * as THREE from 'three';
import { Orientation } from '../../../domain/fleet/Ship';
import { ParticleSystem } from './ParticleSystem';
import { Config } from '../../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

export type AddRippleFn = (worldX: number, worldZ: number, isPlayerBoard: boolean) => void;
export type AddPersistentFireFn = (
    shipGroup: THREE.Group, cellX: number, cellZ: number,
    boardOffset: number, intensity: number, color: string
) => void;

/**
 * Handles ship sinking animation setup, hull splitting into two halves,
 * and per-cell fire/explosion sequences during a sink event.
 *
 * Extracted from ImpactEffects to keep that class focused on
 * immediate impact visuals (voxel destruction, persistent fire for hits).
 */
export class SinkingEffects {
    private particleSystem: ParticleSystem;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    constructor(
        particleSystem: ParticleSystem,
        playerBoardGroup: THREE.Group,
        enemyBoardGroup: THREE.Group
    ) {
        this.particleSystem = particleSystem;
        this.playerBoardGroup = playerBoardGroup;
        this.enemyBoardGroup = enemyBoardGroup;
    }

    /**
     * Sets up the sinking animation for a ship: lean angles, hull split,
     * and per-cell explosion/fire sequence (or instant placement on replay).
     */
    public handleSinking(
        child: THREE.Object3D,
        cellX: number, cellZ: number,
        boardOffset: number,
        isReplay: boolean,
        isPlayer: boolean,
        addRipple: AddRippleFn,
        addPersistentFire: AddPersistentFireFn
    ): void {
        const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

        if (!child.userData.isSinking) {
            child.userData.isSinking = true;

            const maxLean = Config.visual.sinkingMaxAngle;
            child.userData.sinkAngleX = (Math.random() - 0.5) * maxLean * 2;
            child.userData.sinkAngleZ = (Math.random() - 0.5) * maxLean * 2;

            this.splitShipForBreaking(child as THREE.Group, cellX, cellZ);

            // Notify EntityManager to track this in its O(1) animation array
            eventBus.emit(GameEventType.SHIP_STARTED_SINKING, child);
        }

        child.visible = true;

        const shipGroup = child as THREE.Group;
        const isHorizontal = shipGroup.userData.shipOrientation === Orientation.Horizontal;

        let minX = cellX, maxX = cellX, minZ = cellZ, maxZ = cellZ;
        for (let dx = -5; dx <= 5; dx++) {
            if (shipGroup.userData.coversCell(cellX + dx, cellZ)) {
                minX = Math.min(minX, cellX + dx);
                maxX = Math.max(maxX, cellX + dx);
            }
        }
        for (let dz = -5; dz <= 5; dz++) {
            if (shipGroup.userData.coversCell(cellX, cellZ + dz)) {
                minZ = Math.min(minZ, cellZ + dz);
                maxZ = Math.max(maxZ, cellZ + dz);
            }
        }

        const shipLength = Math.max(maxX - minX, maxZ - minZ) + 1;
        const blackSmokeColor = this.particleSystem.blackSmokeMat.color.getStyle();

        if (isReplay) {
            child.position.y = Config.visual.sinkingFloor;
            child.rotation.z = child.userData.sinkAngleZ;
            child.rotation.x = child.userData.sinkAngleX;

            for (let s = 0; s < shipLength; s++) {
                const sx = minX + (isHorizontal ? s : 0);
                const sz = minZ + (!isHorizontal ? s : 0);
                // Sunk ships burn at max intensity (2.0) with black smoke
                addPersistentFire(shipGroup, sx, sz, boardOffset, 2.0, blackSmokeColor);
            }
        } else {
            for (let s = 0; s < shipLength; s++) {
                // More dramatic, slower explosion sequence for sinking
                const delay = s * 0.4 + (Math.random() * 0.2);
                const sx = minX + (isHorizontal ? s : 0);
                const sz = minZ + (!isHorizontal ? s : 0);

                const ex = sx - boardOffset + 0.5;
                const ez = sz - boardOffset + 0.5;

                const speed = Config.timing.gameSpeedMultiplier;
                setTimeout(() => {
                    this.particleSystem.spawnExplosion(ex, 0.4, ez, targetGroup);
                    this.particleSystem.spawnVoxelExplosion(ex, 0.4, ez, 15, targetGroup);
                    const rippleOnPlayerBoard = Config.rogueMode ? false : !isPlayer;
                    addRipple(ex, ez, rippleOnPlayerBoard);
                    addPersistentFire(shipGroup, sx, sz, boardOffset, 2.0, blackSmokeColor);
                }, (delay * 1000) / speed);
            }
        }
    }

    /**
     * Splits a ship mesh into two halves (A and B) around the impact cell,
     * enabling the breaking-apart animation during sinking.
     */
    private splitShipForBreaking(
        shipGroup: THREE.Group,
        pivotCellX: number, pivotCellZ: number
    ): void {
        if (shipGroup.userData.isBroken) return;
        shipGroup.userData.isBroken = true;

        const boardOffset = Config.board.width / 2;
        const px = pivotCellX - boardOffset + 0.5 - shipGroup.position.x;
        const pz = pivotCellZ - boardOffset + 0.5 - shipGroup.position.z;
        const pivotPos = new THREE.Vector3(px, 0, pz);
        shipGroup.userData.pivotPos = pivotPos;

        const halfA = new THREE.Group();
        const halfB = new THREE.Group();
        halfA.position.copy(pivotPos);
        halfB.position.copy(pivotPos);

        shipGroup.add(halfA);
        shipGroup.add(halfB);
        shipGroup.userData.halfA = halfA;
        shipGroup.userData.halfB = halfB;

        const isHorizontal = shipGroup.userData.shipOrientation === Orientation.Horizontal;

        const children = [...shipGroup.children];
        children.forEach(child => {
            if (child === halfA || child === halfB) return;

            if (child instanceof THREE.InstancedMesh) {
                const imA = child.clone();
                const imB = child.clone();

                imA.position.sub(pivotPos);
                imB.position.sub(pivotPos);

                halfA.add(imA);
                halfB.add(imB);

                const dummy = new THREE.Object3D();
                for (let i = 0; i < child.count; i++) {
                    child.getMatrixAt(i, dummy.matrix);
                    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

                    const voxelLocalX = dummy.position.x + child.position.x;
                    const voxelLocalZ = dummy.position.z + child.position.z;
                    const isPartA = isHorizontal ? voxelLocalX < px : voxelLocalZ < pz;

                    if (isPartA) {
                        dummy.scale.set(0, 0, 0);
                        dummy.updateMatrix();
                        imB.setMatrixAt(i, dummy.matrix);
                    } else {
                        dummy.scale.set(0, 0, 0);
                        dummy.updateMatrix();
                        imA.setMatrixAt(i, dummy.matrix);
                    }
                }
                imA.instanceMatrix.needsUpdate = true;
                imB.instanceMatrix.needsUpdate = true;
                shipGroup.remove(child);
            } else {
                const isPartA = isHorizontal ? child.position.x < px : child.position.z < pz;
                child.position.sub(pivotPos);
                if (isPartA) halfA.add(child);
                else halfB.add(child);
            }
        });
    }
}
