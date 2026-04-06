import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { ShipFactory } from './ShipFactory';
import { VesselVisibilityManager } from './VesselVisibilityManager';
import { ShipAnimator } from './ShipAnimator';
import { TurretInstanceManager } from './TurretInstanceManager';

export class ShipPlacementCoordinator {
    constructor(
        private playerBoardGroup: THREE.Group,
        private enemyBoardGroup: THREE.Group,
        private playerTurretManager: TurretInstanceManager,
        private enemyTurretManager: TurretInstanceManager,
        private visibilityManager: VesselVisibilityManager,
        private shipAnimator: ShipAnimator,
        private addRipple: (worldX: number, worldZ: number, isPlayerBoard: boolean) => void
    ) {}

    public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
        const isRogue = Config.rogueMode;
        const targetGroup = isRogue ? this.playerBoardGroup : (isPlayer ? this.playerBoardGroup : this.enemyBoardGroup);

        let shipGroup: THREE.Group;
        const boardOffset = Config.board.width / 2;

        if (ship.specialType === 'sonar') {
            shipGroup = ShipFactory.createSonarBuoy(isPlayer);
            shipGroup.position.set(x - boardOffset + 0.5, 0, z - boardOffset + 0.5);
            shipGroup.userData = { isShip: true, ship, shipOrientation: orientation };
            targetGroup.add(shipGroup);
        } else if (ship.specialType === 'mine') {
            shipGroup = ShipFactory.createMine(isPlayer);
            shipGroup.position.set(x - boardOffset + 0.5, 0.4, z - boardOffset + 0.5);
            shipGroup.userData = { isShip: true, ship, shipOrientation: orientation };
            targetGroup.add(shipGroup);
        } else {
            const turretManager = isRogue ? this.playerTurretManager : (isPlayer ? this.playerTurretManager : this.enemyTurretManager);
            shipGroup = ShipFactory.createShip(ship, x, z, orientation, isPlayer, targetGroup, turretManager);
        }

        if (!isPlayer) shipGroup.visible = false;

        // Prevent ghosting: remove old group if it exists
        const oldGroup = this.visibilityManager.getGroupForShip(ship);
        if (oldGroup && oldGroup.parent) {
            oldGroup.parent.remove(oldGroup);
        }

        this.visibilityManager.trackShip(ship, shipGroup);
        this.shipAnimator.registerShipMesh(shipGroup);

        let cx = x, cz = z;
        if (orientation === Orientation.Horizontal) cx += Math.floor(ship.size / 2);
        else if (orientation === Orientation.Vertical) cz += Math.floor(ship.size / 2);
        else if (orientation === Orientation.Left) cx -= Math.floor(ship.size / 2);
        else if (orientation === Orientation.Up) cz -= Math.floor(ship.size / 2);

        this.addRipple(cx - boardOffset + 0.5, cz - boardOffset + 0.5, isPlayer);
    }

    public moveShip3D(ship: Ship, x: number, z: number, orientation: Orientation) {
        let targetGroup: THREE.Group | undefined;
        let parentGroup: THREE.Group | undefined;

        [this.playerBoardGroup, this.enemyBoardGroup].forEach(boardGroup => {
            boardGroup.children.forEach((child: THREE.Object3D) => {
                if (child.userData.isShip && child.userData.ship?.id === ship.id) {
                    targetGroup = child as THREE.Group;
                    parentGroup = boardGroup;
                }
            });
        });

        if (!targetGroup || !parentGroup) return;

        if (targetGroup.userData.shipOrientation !== orientation) {
            const isPlayer = !ship.isEnemy;
            const turretManager = isPlayer ? this.playerTurretManager : this.enemyTurretManager;
            // Remove old turret instances before recreating
            turretManager.removeTurrets(ship.id);
            this.shipAnimator.unregisterShipMesh(targetGroup);
            parentGroup.remove(targetGroup);
            const newShipGroup = ShipFactory.createShip(ship, ship.headX, ship.headZ, orientation, isPlayer, parentGroup, turretManager);
            newShipGroup.position.copy(targetGroup.position);
            targetGroup = newShipGroup;
            this.visibilityManager.trackShip(ship, targetGroup);
            this.shipAnimator.registerShipMesh(targetGroup);
        }

        const boardOffset = Config.board.width / 2;
        targetGroup.userData.targetPosition = new THREE.Vector3(x - boardOffset + 0.5, 0, z - boardOffset + 0.5);
    }
}
