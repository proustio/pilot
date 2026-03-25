import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { FogManager } from './FogManager';

export class VesselVisibilityManager {
    public allShips: Ship[] = [];

    constructor(
        private fogManager: FogManager,
        private playerBoardGroup: THREE.Group,
        private enemyBoardGroup: THREE.Group
    ) {}

    public trackShip(ship: Ship) {
        if (!this.allShips.includes(ship)) {
            this.allShips.push(ship);
        }
    }

    public update(time: number) {
        // Dynamic fog and enemy visibility
        this.fogManager.updateRogueFog(this.allShips);
        
        // Update enemy ship visibility based on fog/sink status (Throttled)
        if (Math.floor(time * 60) % 5 === 0) { // Every 5 frames (~12fps)
            this.updateEnemyShipVisibility();
        }
    }

    private updateEnemyShipVisibility() {
        this.allShips.forEach(ship => {
            if (!ship.isEnemy) return;
            
            let shipGroup: THREE.Group | undefined;
            [this.playerBoardGroup, this.enemyBoardGroup].forEach(bg => {
                bg.children.forEach(child => {
                    if (child.userData.isShip && child.userData.ship?.id === ship.id) {
                        shipGroup = child as THREE.Group;
                    }
                });
            });

            if (shipGroup) {
                let isVisible: boolean;
                if (Config.rogueMode) {
                    const coords = ship.getOccupiedCoordinates();
                    isVisible = coords.some(c => this.fogManager.isCellRevealed(c.x, c.z)) || ship.isSunk();
                    
                    if (isVisible) {
                        this.updateShipPartialVisibility(ship, shipGroup);
                    }
                } else {
                    isVisible = ship.isSunk();
                }
                shipGroup.visible = isVisible;
            }
        });
    }

    private updateShipPartialVisibility(ship: Ship, shipGroup: THREE.Group) {
        if (!Config.rogueMode || !ship.isEnemy) return;

        const coords = ship.getOccupiedCoordinates();
        const instancedMesh = shipGroup.userData.instancedMesh as THREE.InstancedMesh;
        const instancedLines = shipGroup.children.find(c => c instanceof THREE.InstancedMesh && c !== instancedMesh) as THREE.InstancedMesh;

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
                    const revealed = this.fogManager.isCellRevealed(cell.x, cell.z);
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
        updateMesh(instancedLines);

        shipGroup.children.forEach(child => {
            if (child instanceof THREE.Group && !child.userData.isShip) {
                const segmentIndex = Math.floor(child.position.x + 0.5);
                if (segmentIndex >= 0 && segmentIndex < coords.length) {
                    const cell = coords[segmentIndex];
                    child.visible = this.fogManager.isCellRevealed(cell.x, cell.z);
                }
            }
        });
    }

    public reset() {
        this.allShips = [];
    }
}
