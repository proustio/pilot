import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { EntityState } from './EntityState';

export class ShipBuilder {
    private state: EntityState;

    constructor(state: EntityState) {
        this.state = state;
    }

    public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
        const targetGroup = isPlayer ? this.state.playerBoardGroup : this.state.enemyBoardGroup;

        const shipGroup = new THREE.Group();
        shipGroup.userData = {
            isShip: true,
            isSinking: false,
            shipOrientation: orientation,
            coversCell: (tx: number, tz: number) => {
                if (orientation === Orientation.Horizontal) {
                    return tz === z && tx >= x && tx < x + ship.size;
                } else {
                    return tx === x && tz >= z && tz < z + ship.size;
                }
            }
        };

        const boardOffset = Config.board.width / 2;
        const originWorldX = x - boardOffset + 0.5;
        const originWorldZ = z - boardOffset + 0.5;
        shipGroup.position.set(originWorldX, 0, originWorldZ);
        shipGroup.visible = isPlayer;

        // Base dark metal colors
        const hullColor = new THREE.Color(0x111111); // Black/Dark Grey
        const deckColor = new THREE.Color(0x222222);
        const bridgeColor = new THREE.Color(0x1a1a1a);
        const darkAccent = new THREE.Color(0x050505);

        // Neon Accents (Glow colors assigned to edges/accents)
        const accentColor = isPlayer ? new THREE.Color(0xFFD700) : new THREE.Color(0xFF2400); // Gold vs Scarlet

        const voxelSize = 0.1;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        const length = orientation === Orientation.Horizontal ? ship.size : 1;
        const width = orientation === Orientation.Vertical ? ship.size : 1;

        const voxelsData: { pos: THREE.Vector3, color: THREE.Color }[] = [];

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
                const shipLengthPos = orientation === Orientation.Horizontal ? lx : lz;
                const shipWidthPos = orientation === Orientation.Horizontal ? lz : lx;

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
                        if (ly === maxLy && !isEdge) {
                            color = deckColor;
                            if (isCarrier && !isEdge && shipWidthPos === Math.floor(center)) {
                                color = darkAccent;
                            }
                        } else if (isEdge && ly > 1) {
                            color = accentColor;
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
                            color
                        });
                    }
                }
            }
        }

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

        // Add Emissive/Glow Effect if Color matches Neon Accent
        // Using instanced mesh per-instance emissive coloring isn't natively supported easily,
        // so we fake it by setting the global material emissive map or just relying on intense directional lighting.
        // Instead, we create a wireframe outline overlay to enforce the "neon border" jarvis vibe.

        const instancedLines = new THREE.InstancedMesh(
            new THREE.BoxGeometry(voxelSize * 1.01, voxelSize * 1.01, voxelSize * 1.01), // slightly larger box for line substitute
            new THREE.MeshBasicMaterial({
                color: isPlayer ? 0xFFD700 : 0xFF2400,
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
            // Only show glow on the edges/accents
            if (vd.color.equals(accentColor)) {
                instancedLines.setColorAt(index, new THREE.Color(isPlayer ? 0xFFD700 : 0xFF2400));
            } else {
                instancedLines.setColorAt(index, new THREE.Color(0x000000));
                // hide the others by zeroing scale
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                instancedLines.setMatrixAt(index, dummy.matrix);
            }
        });

        instancedLines.instanceMatrix.needsUpdate = true;
        if (instancedLines.instanceColor) instancedLines.instanceColor.needsUpdate = true;

        shipGroup.add(instancedLines);

        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        shipGroup.userData.instancedMesh = instancedMesh;
        shipGroup.add(instancedMesh);

        const turretCount = ship.size <= 2 ? 1 : ship.size <= 4 ? 2 : 3;
        const turretBaseMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 });

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

            if (orientation === Orientation.Horizontal) {
                barrelMesh.rotation.z = Math.PI / 2;
                barrelMesh.position.x = 0.12;
                turretGroup.position.set(tPos, 0.2, 0);
            } else {
                barrelMesh.rotation.x = Math.PI / 2;
                barrelMesh.position.z = 0.12;
                turretGroup.position.set(0, 0.2, tPos);
            }
            barrelMesh.position.y = 0.02;
            turretGroup.add(barrelMesh);

            shipGroup.add(turretGroup);
        }

        targetGroup.add(shipGroup);

        const cx = orientation === Orientation.Horizontal ? x + Math.floor(ship.size / 2) : x;
        const cz = orientation === Orientation.Vertical ? z + Math.floor(ship.size / 2) : z;
        const rippleWorldX = cx - boardOffset + 0.5;
        const rippleWorldZ = cz - boardOffset + 0.5;
        this.state.addRipple(rippleWorldX, rippleWorldZ, isPlayer);
    }
}
