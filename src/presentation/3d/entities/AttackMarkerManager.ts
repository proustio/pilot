import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { ProjectileManager } from './ProjectileManager';
import { FogManager } from './FogManager';
import { VesselVisibilityManager } from './VesselVisibilityManager';

export class AttackMarkerManager {
    constructor(
        private playerBoardGroup: THREE.Group,
        private enemyBoardGroup: THREE.Group,
        private projectileManager: ProjectileManager,
        private fogManager: FogManager,
        private visibilityManager: VesselVisibilityManager,
        private addRippleCallback: (x: number, z: number, isPlayer: boolean) => void
    ) {}

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean = false) {
        if (isPlayer && Config.rogueMode) {
            this.fogManager.revealCellTemporarily(x, z);
            if (result === 'sunk') this.revealSunkShip(x, z);
        }
        this.projectileManager.addAttackMarker(x, z, result, isPlayer, isReplay, this.addRippleCallback);
    }

    public clearTransientMarkers() {
        const clearFromGroup = (group: THREE.Group) => {
            for (let i = group.children.length - 1; i >= 0; i--) {
                const child = group.children[i];
                if (child.userData.isAttackMarker && child.userData.result !== 'sunk' && child.userData.result !== 'hit') {
                    if (child.userData.dispose) child.userData.dispose();
                    group.remove(child);
                }
            }
        };

        clearFromGroup(this.playerBoardGroup);
        clearFromGroup(this.enemyBoardGroup);
    }

    private revealSunkShip(x: number, z: number) {
        const sunkShip = this.visibilityManager.allShips.find(s => s.isEnemy && s.getOccupiedCoordinates().some(c => c.x === x && c.z === z));
        if (sunkShip) {
            sunkShip.getOccupiedCoordinates().forEach((c: { x: number, z: number }) => {
                this.fogManager.revealCellPermanently(c.x, c.z);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const rx = c.x + dx, rz = c.z + dz;
                        if (rx >= 0 && rx < Config.board.width && rz >= 0 && rz < Config.board.height) {
                            this.fogManager.revealCellPermanently(rx, rz);
                        }
                    }
                }
            });
        }
    }
}
