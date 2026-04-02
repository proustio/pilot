import * as THREE from 'three';
import { Ship } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { FogManager } from './FogManager';

export class VesselVisibilityManager {
    public allShips: Ship[] = [];
    private shipMap: Map<Ship, THREE.Group> = new Map();

    constructor(
        private fogManager: FogManager
    ) { }

    public trackShip(ship: Ship, group: THREE.Group) {
        if (!this.allShips.includes(ship)) {
            this.allShips.push(ship);
        }
        this.shipMap.set(ship, group);
    }

    public update(time: number) {
        // Dynamic fog and enemy visibility
        this.fogManager.updateRogueFog(this.allShips);

        // Update enemy ship visibility based on fog/sink status (Throttled)
        if (Math.floor(time * 60) % 5 === 0) { // Every 5 frames (~12fps)
            this.updateEnemyShipVisibility();
        }
    }

    public forceUpdate() {
        this.fogManager.markFogDirty();
        this.updateEnemyShipVisibility();
    }

    private updateEnemyShipVisibility() {
        this.shipMap.forEach((shipGroup, ship) => {
            if (!ship.isEnemy) return;

            let isVisible: boolean;
            if (Config.rogueMode) {
                const coords = ship.getOccupiedCoordinates();

                // Rule: If the ship has taken ANY hits, consider it visible immediately, 
                // bypassing the local fog check for the parent visibility.
                const isHit = ship.isSunk() || ship.segments.some(s => s === false);
                isVisible = isHit || coords.some(c => this.fogManager.isCellRevealed(c.x, c.z));

                if (isVisible) {
                    this.updateShipPartialVisibility(ship, shipGroup);
                }
            } else {
                isVisible = ship.isSunk();
            }
            shipGroup.visible = isVisible;
        });
    }

    private updateShipPartialVisibility(ship: Ship, shipGroup: THREE.Group) {
        if (!Config.rogueMode || !ship.isEnemy) return;

        const coords = ship.getOccupiedCoordinates();
        const instancedMesh = shipGroup.userData.instancedMesh as THREE.InstancedMesh;
        if (!instancedMesh) return;

        const updateMesh = (im: THREE.InstancedMesh) => {
            if (!im) return;
            const dummy = new THREE.Object3D();
            let needsUpdate = false;

            for (let i = 0; i < im.count; i++) {
                im.getMatrixAt(i, dummy.matrix);
                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

                const segmentIndex = Math.floor(dummy.position.x + 0.5);
                if (segmentIndex >= 0 && segmentIndex < coords.length) {
                    const cell = coords[segmentIndex];

                    // Rule: If the entire ship is sunk, OR if this specific segment is hit,
                    // we show it IMMEDIATELY regardless of the fog fade-out state.
                    const isSunk = ship.isSunk();
                    const isHit = ship.segments[segmentIndex] === false;
                    const revealed = isSunk || isHit || this.fogManager.isCellRevealed(cell.x, cell.z);
                    const targetScale = revealed ? 1.0 : 0.0;

                    if (Math.abs(dummy.scale.x - targetScale) > 0.001) {
                        dummy.scale.setScalar(targetScale);
                        dummy.updateMatrix();
                        im.setMatrixAt(i, dummy.matrix);
                        needsUpdate = true;
                    }
                }
            }
            if (needsUpdate) im.instanceMatrix.needsUpdate = true;
        };

        updateMesh(instancedMesh);

        shipGroup.children.forEach(child => {
            if (child instanceof THREE.Group && !child.userData.isShip) {
                const segmentIndex = Math.floor(child.position.x + 0.5);
                if (segmentIndex >= 0 && segmentIndex < coords.length) {
                    const cell = coords[segmentIndex];
                    // Same rule here for non-instanced children (guns, etc.)
                    const isSunk = ship.isSunk();
                    const isHit = ship.segments[segmentIndex] === false;
                    child.visible = isSunk || isHit || this.fogManager.isCellRevealed(cell.x, cell.z);
                }
            }
        });
    }

    public reset() {
        this.allShips = [];
        this.shipMap.clear();
    }

    public getGroupForShip(ship: Ship): THREE.Group | undefined {
        return this.shipMap.get(ship);
    }
}
