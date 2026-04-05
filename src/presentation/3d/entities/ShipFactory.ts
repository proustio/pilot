import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { ShipVoxelBuilder } from './ShipVoxelBuilder';
import { TurretInstanceManager, TurretTransform } from './TurretInstanceManager';

/**
 * Constructs voxel ship models (hull, deck, bridge, turrets, wireframe overlay)
 * and adds them to the appropriate board group. Delegates hull voxel generation
 * to ShipVoxelBuilder.
 */
export class ShipFactory {
    /**
     * Builds a 3D voxel ship and adds it to the target board group.
     * Returns a reference to the created ship group.
     */
    public static createShip(
        ship: Ship,
        x: number,
        z: number,
        orientation: Orientation,
        isPlayer: boolean,
        targetGroup: THREE.Group,
        turretManager: TurretInstanceManager
    ): THREE.Group {
        if (!turretManager) {
            throw new Error("TurretInstanceManager must be provided to createShip");
        }

        const shipGroup = new THREE.Group();
        shipGroup.userData = {
            isShip: true,
            isSinking: false,
            ship: ship,
            shipOrientation: orientation,
            coversCell: (tx: number, tz: number) => {
                const coords = ship.getOccupiedCoordinates();
                return coords.some(c => c.x === tx && c.z === tz);
            }
        };

        const boardOffset = Config.board.width / 2;
        const originWorldX = x - boardOffset + 0.5;
        const originWorldZ = z - boardOffset + 0.5;
        shipGroup.position.set(originWorldX, 0, originWorldZ);

        if (orientation === Orientation.Vertical) {
            shipGroup.rotation.y = -Math.PI / 2;
        } else if (orientation === Orientation.Left) {
            shipGroup.rotation.y = Math.PI;
        } else if (orientation === Orientation.Up) {
            shipGroup.rotation.y = Math.PI / 2;
        }

        shipGroup.visible = isPlayer || !Config.rogueMode;

        if (Config.rogueMode) {
            ship.isEnemy = !isPlayer;
        }

        // ───── Voxel Hull (delegated to ShipVoxelBuilder) ─────
        const voxelsData = ShipVoxelBuilder.buildVoxels(ship, isPlayer);

        // ───── Instanced Mesh ─────
        const voxelSize = 0.1;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        const shipMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.2,
            metalness: 0.8
        });

        const instancedMesh = new THREE.InstancedMesh(voxelGeo, shipMaterial, voxelsData.length);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        voxelsData.forEach((vd, index) => {
            dummy.position.copy(vd.pos);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(index, dummy.matrix);
            instancedMesh.setColorAt(index, vd.color);
        });

        const updateShipTheme = () => {
            const currentAccent = isPlayer ? ThemeManager.getInstance().getPlayerShipColor() : ThemeManager.getInstance().getEnemyShipColor();

            voxelsData.forEach((vd, index) => {
                if (vd.isAccent) {
                    instancedMesh.setColorAt(index, currentAccent);
                }
            });

            if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
        };

        const themeListener = () => updateShipTheme();
        eventBus.on(GameEventType.THEME_CHANGED, themeListener);
        shipGroup.userData.themeListener = themeListener;
        shipGroup.userData.dispose = () => {
            eventBus.off(GameEventType.THEME_CHANGED, themeListener);
            instancedMesh.dispose();
            instancedMesh.geometry.dispose();
            (instancedMesh.material as THREE.Material).dispose();
        };

        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        shipGroup.userData.instancedMesh = instancedMesh;
        shipGroup.add(instancedMesh);

        // ───── Turrets ─────
        ShipFactory.addTurrets(shipGroup, ship, turretManager);

        targetGroup.add(shipGroup);
        return shipGroup;
    }

    private static addTurrets(shipGroup: THREE.Group, ship: Ship, turretManager: TurretInstanceManager) {
        if (!turretManager) {
            throw new Error("TurretInstanceManager must be provided to createShip");
        }

        const turretCount = ship.size <= 2 ? 1 : ship.size <= 4 ? 2 : 3;
        const shipLen = ship.size;

        // Instanced path: compute TurretTransform[] and delegate to the manager
        const transforms: TurretTransform[] = [];
        for (let i = 0; i < turretCount; i++) {
            const tPos = ((i + 1) / (turretCount + 1)) * shipLen - 0.5;
            transforms.push({
                localPosition: new THREE.Vector3(tPos, 0.2, 0),
                barrelOffset: new THREE.Vector3(0.12, 0.02, 0),
                barrelRotation: new THREE.Euler(0, 0, Math.PI / 2),
            });
        }
        // Use the ship group's local matrix (relative to board group, same parent as the InstancedMesh)
        shipGroup.updateMatrix();
        turretManager.addTurrets(ship.id, transforms, shipGroup.matrix);
    }

    public static createMine(isPlayer: boolean): THREE.Group {
        const group = new THREE.Group();
        const voxelSize = 0.08;
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        const material = new THREE.MeshStandardMaterial({
            color: isPlayer ? 0x50C878 : 0x8D2B00,
            metalness: 0.8,
            roughness: 0.2
        });

        const positions = [
            [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
            [2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2]
        ];

        const instancedMesh = new THREE.InstancedMesh(geometry, material, positions.length);
        const dummy = new THREE.Object3D();
        positions.forEach((p, i) => {
            dummy.position.set(p[0] * voxelSize, p[1] * voxelSize, p[2] * voxelSize);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        });

        group.add(instancedMesh);
        return group;
    }

    public static createSonarBuoy(isPlayer: boolean): THREE.Group {
        const group = new THREE.Group();
        const voxelSize = 0.08;
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        const material = new THREE.MeshStandardMaterial({
            color: isPlayer ? 0x4169E1 : 0x8D2B00,
            metalness: 0.5,
            roughness: 0.5
        });

        const positions = [
            [0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [0, 4, 0],
            [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
            [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
            [0, 5, 0]
        ];

        const instancedMesh = new THREE.InstancedMesh(geometry, material, positions.length);
        const dummy = new THREE.Object3D();
        positions.forEach((p, i) => {
            dummy.position.set(p[0] * voxelSize, p[1] * voxelSize, p[2] * voxelSize);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        });

        group.add(instancedMesh);

        const lightGeom = new THREE.SphereGeometry(0.05, 8, 8);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
        const lightMesh = new THREE.Mesh(lightGeom, lightMat);
        lightMesh.position.set(0, 5 * voxelSize + 0.05, 0);
        lightMesh.userData = { isStatusLED: true, phase: 0 };
        group.add(lightMesh);

        return group;
    }
}
