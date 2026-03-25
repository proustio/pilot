import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

/**
 * Constructs voxel ship models (hull, deck, bridge, turrets, wireframe overlay)
 * and adds them to the appropriate board group.
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
        targetGroup: THREE.Group
    ): THREE.Group {
        const shipGroup = new THREE.Group();
        shipGroup.userData = {
            isShip: true,
            isSinking: false,
            ship: ship, // Store reference to domain object
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

        // Apply rotation based on orientation
        if (orientation === Orientation.Vertical) {
            shipGroup.rotation.y = -Math.PI / 2;
        } else if (orientation === Orientation.Left) {
            shipGroup.rotation.y = Math.PI;
        } else if (orientation === Orientation.Up) {
            shipGroup.rotation.y = Math.PI / 2;
        }
        
        // In Rogue mode, all ships on the same board are visible initially? 
        // No, they should be hidden by fog. 
        shipGroup.visible = isPlayer || !Config.rogueMode; 
        
        if (Config.rogueMode) {
            ship.isEnemy = !isPlayer; // Sync domain object
        }

        // ───── Colors ─────
        let hullColor = new THREE.Color(0x111111);
        let deckColor = new THREE.Color(0x222222);
        let bridgeColor = new THREE.Color(0x1a1a1a);
        let darkAccent = new THREE.Color(0x050505);

        if (!isPlayer) {
            const invert = (c: THREE.Color) => new THREE.Color(1 - c.r, 1 - c.g, 1 - c.b);
            hullColor = invert(hullColor);
            deckColor = invert(deckColor);
            bridgeColor = invert(bridgeColor);
            darkAccent = invert(darkAccent);
        }
        
        const tm = ThemeManager.getInstance();
        const accentColor = isPlayer ? tm.getPlayerShipColor() : tm.getEnemyShipColor();

        // ───── Voxel Hull ─────
        const voxelSize = 0.1;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        const length = ship.size;
        const width = 1;

        const voxelsData: { pos: THREE.Vector3, color: THREE.Color, isAccent: boolean }[] = [];

        const L = ship.size * 10;
        const centerX = L / 2 - 0.5;

        const isCarrier = ship.size === 5;
        const isBattleship = ship.size === 4;
        const isDestroyer = ship.size === 3;

        const getHullWidth = (xNorm: number): number => {
            const absX = Math.abs(xNorm);
            if (isCarrier) {
                if (absX > 0.8) return 2.0 + 3.0 * (1.0 - (absX - 0.8) / 0.2);
                return 5.0;
            } else if (isBattleship) {
                if (absX > 0.7) return 1.5 + 2.5 * (1.0 - (absX - 0.7) / 0.3);
                return 4.0;
            } else if (isDestroyer) {
                if (absX > 0.6) return 1.0 + 2.0 * (1.0 - (absX - 0.6) / 0.4);
                return 3.0;
            } else {
                if (absX > 0.5) return 1.0 + 1.0 * (1.0 - (absX - 0.5) / 0.5);
                return 2.0;
            }
        };

        const getBridgeHeight = (xNorm: number, isEdge: boolean, shipWidthPos: number, maxW: number): number => {
            const absX = Math.abs(xNorm);
            if (isCarrier) {
                const isIslandSide = (maxW - shipWidthPos) <= 2.0;
                if (absX < 0.2 && isIslandSide && !isEdge) return 4;
                return 1;
            } else if (isBattleship) {
                if (absX < 0.15 && !isEdge) return 5;
                if (absX < 0.3 && !isEdge) return 3;
                return 1;
            } else if (isDestroyer) {
                if (xNorm > -0.2 && xNorm < 0.1 && !isEdge) return 3;
                return 1;
            } else {
                if (xNorm > 0.0 && xNorm < 0.4 && !isEdge) return 2;
                return 1;
            }
        };

        for (let lx = 0; lx < length * 10; lx++) {
            for (let lz = 0; lz < width * 10; lz++) {
                const shipLengthPos = lx;
                const shipWidthPos = lz;

                const xNorm = (shipLengthPos - centerX) / (L / 2);
                const halfWidth = getHullWidth(xNorm);
                const center = 4.5;
                const minW = center - halfWidth;
                const maxW = center + halfWidth;

                if (shipWidthPos >= Math.floor(minW) && shipWidthPos <= Math.ceil(maxW)) {
                    const isEdge = (shipWidthPos - minW) < 1.0 || (maxW - shipWidthPos) < 1.0;
                    const isBowStern = Math.abs(xNorm) > 0.85;

                    let maxLy = getBridgeHeight(xNorm, isEdge, shipWidthPos, maxW);

                    if (isEdge || isBowStern) {
                        const bowRise = isCarrier ? 0 : Math.pow(Math.max(0, Math.abs(xNorm) - 0.7) / 0.3, 2) * 2;
                        maxLy = Math.max(maxLy, 2 + bowRise);
                    }

                    for (let ly = 1; ly <= maxLy; ly++) {
                        let color = hullColor;
                        let isAccent = false;
                        
                        // Front (bow) distinction: Use accent color for the tip of the deck at the front
                        const isFront = xNorm > 0.8;

                        if (ly === maxLy && !isEdge) {
                            color = deckColor;
                            if (isCarrier && !isEdge && shipWidthPos === Math.floor(center)) {
                                color = darkAccent;
                            }
                            // Highlight the bow on the top deck
                            if (isFront) {
                                color = accentColor;
                                isAccent = true;
                            }
                        } else if (isEdge && ly > 1) {
                            color = accentColor;
                            isAccent = true;
                        } else if (ly > 2 && !isEdge) {
                            color = bridgeColor;
                            if (ly === maxLy && (lx % 2 === 0)) color = darkAccent;
                        }

                        voxelsData.push({
                            pos: new THREE.Vector3(
                                lx * voxelSize - (voxelSize / 2 * 9),
                                ly * voxelSize,
                                lz * voxelSize - (voxelSize / 2 * 9)
                            ),
                            color,
                            isAccent
                        });
                    }
                }
            }
        }

        // ───── Instanced Mesh ─────
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

        // ───── Wireframe Neon Overlay ─────
        const instancedLines = new THREE.InstancedMesh(
            new THREE.BoxGeometry(voxelSize * 1.01, voxelSize * 1.01, voxelSize * 1.01),
            new THREE.MeshBasicMaterial({
                color: accentColor,
                wireframe: true,
                transparent: true,
                opacity: 0.2
            }),
            voxelsData.length
        );

        voxelsData.forEach((vd, index) => {
            dummy.scale.setScalar(1);
            dummy.position.copy(vd.pos);
            dummy.updateMatrix();
            instancedLines.setMatrixAt(index, dummy.matrix);
            if (vd.isAccent) {
                instancedLines.setColorAt(index, accentColor);
            } else {
                instancedLines.setColorAt(index, new THREE.Color(0x000000));
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                instancedLines.setMatrixAt(index, dummy.matrix);
            }
        });

        instancedLines.instanceMatrix.needsUpdate = true;
        if (instancedLines.instanceColor) instancedLines.instanceColor.needsUpdate = true;

        const updateShipTheme = () => {
            const currentAccent = isPlayer ? ThemeManager.getInstance().getPlayerShipColor() : ThemeManager.getInstance().getEnemyShipColor();
            (instancedLines.material as THREE.MeshBasicMaterial).color.copy(currentAccent);

            voxelsData.forEach((vd, index) => {
                if (vd.isAccent) {
                    instancedLines.setColorAt(index, currentAccent);
                    instancedMesh.setColorAt(index, currentAccent);
                }
            });

            if (instancedLines.instanceColor) instancedLines.instanceColor.needsUpdate = true;
            if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
        };
        
        const themeListener = () => updateShipTheme();
        eventBus.on(GameEventType.THEME_CHANGED, themeListener);
        shipGroup.userData.themeListener = themeListener;
        shipGroup.userData.dispose = () => {
            eventBus.off(GameEventType.THEME_CHANGED, themeListener);
            instancedMesh.dispose();
            instancedLines.dispose();
            instancedMesh.geometry.dispose();
            (instancedMesh.material as THREE.Material).dispose();
            instancedLines.geometry.dispose();
            (instancedLines.material as THREE.Material).dispose();
        };

        shipGroup.add(instancedLines);

        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        shipGroup.userData.instancedMesh = instancedMesh;
        shipGroup.add(instancedMesh);

        // ───── Turrets ─────
        ShipFactory.addTurrets(shipGroup, ship, isPlayer);

        targetGroup.add(shipGroup);
        return shipGroup;
    }

    private static addTurrets(shipGroup: THREE.Group, ship: Ship, isPlayer: boolean) {
        const turretCount = ship.size <= 2 ? 1 : ship.size <= 4 ? 2 : 3;
        let turretBaseColor = new THREE.Color(0x2a2a2a);
        let barrelColor = new THREE.Color(0x555555);

        if (!isPlayer) {
            turretBaseColor = new THREE.Color(1 - turretBaseColor.r, 1 - turretBaseColor.g, 1 - turretBaseColor.b);
            barrelColor = new THREE.Color(1 - barrelColor.r, 1 - barrelColor.g, 1 - barrelColor.b);
        }

        const turretBaseMat = new THREE.MeshStandardMaterial({ color: turretBaseColor, roughness: 0.6 });
        const barrelMat = new THREE.MeshStandardMaterial({ color: barrelColor, roughness: 0.5 });

        const shipLen = ship.size;

        for (let i = 0; i < turretCount; i++) {
            const turretGroup = new THREE.Group();
            const tPos = ((i + 1) / (turretCount + 1)) * shipLen - 0.5;

            const baseGeo = new THREE.BoxGeometry(0.15, 0.08, 0.15);
            const baseMesh = new THREE.Mesh(baseGeo, turretBaseMat);
            baseMesh.castShadow = true;
            turretGroup.add(baseMesh);

            const barrelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6);
            const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
            barrelMesh.castShadow = true;

            // Always use horizontal layout for turrets as the group is rotated
            barrelMesh.rotation.z = Math.PI / 2;
            barrelMesh.position.x = 0.12;
            turretGroup.position.set(tPos, 0.2, 0);
            
            barrelMesh.position.y = 0.02;
            turretGroup.add(barrelMesh);

            shipGroup.add(turretGroup);
        }
    }
}
