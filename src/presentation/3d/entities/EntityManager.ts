import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { BoardBuilder } from './BoardBuilder';
import { ShipFactory } from './ShipFactory';
import { ProjectileManager } from './ProjectileManager';
import { FogManager } from './FogManager';
import { ParticleSystem } from './ParticleSystem';
import { WaterShaderManager } from './WaterShaderManager';
import { VesselVisibilityManager } from './VesselVisibilityManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { SonarEffect } from './SonarEffect';

export class EntityManager {
    private scene: THREE.Scene;

    public masterBoardGroup: THREE.Group;
    private staticGroup: THREE.Group;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    private targetRotationX: number = 0;

    private playerRaycastPlanes: THREE.Object3D[] = [];
    private enemyRaycastPlanes: THREE.Object3D[] = [];

    public get boardOrientation(): 'player' | 'enemy' {
        return Math.abs(this.targetRotationX - Math.PI) < 0.1 ? 'enemy' : 'player';
    }

    private time: number = 0;
    private wasBusy: boolean = false;

    private activeSonarEffects: SonarEffect[] = [];

    // Sub-managers
    private particleSystem: ParticleSystem;
    private fogManager: FogManager;
    private projectileManager: ProjectileManager;
    private waterManager: WaterShaderManager;
    private visibilityManager: VesselVisibilityManager;

    private activeRogueShipId: string | null = null;
    private isPlayerTurn: boolean = false;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.masterBoardGroup = new THREE.Group();
        this.staticGroup = new THREE.Group();
        this.playerBoardGroup = new THREE.Group();
        this.enemyBoardGroup = new THREE.Group();

        this.particleSystem = new ParticleSystem();
        this.fogManager = new FogManager(this.enemyBoardGroup, Config.rogueMode);

        this.playerBoardGroup.position.y = 1.2;
        this.enemyBoardGroup.position.y = -1.2;
        this.enemyBoardGroup.rotation.x = Math.PI;

        this.masterBoardGroup.add(this.playerBoardGroup);
        this.masterBoardGroup.add(this.enemyBoardGroup);

        this.scene.add(this.masterBoardGroup);
        this.scene.add(this.staticGroup);

        const buildResult = BoardBuilder.build(
            this.masterBoardGroup,
            this.staticGroup,
            this.playerBoardGroup,
            this.enemyBoardGroup,
            this.fogManager
        );

        this.playerRaycastPlanes = buildResult.playerRaycastPlanes;
        this.enemyRaycastPlanes = buildResult.enemyRaycastPlanes;

        this.waterManager = new WaterShaderManager(buildResult.playerWaterUniforms, buildResult.enemyWaterUniforms);
        this.visibilityManager = new VesselVisibilityManager(this.fogManager);

        this.projectileManager = new ProjectileManager(
            this.particleSystem,
            this.fogManager,
            this.playerBoardGroup,
            this.enemyBoardGroup
        );

        eventBus.on(GameEventType.ACTIVE_SHIP_CHANGED, (payload) => {
            this.activeRogueShipId = payload.ship?.id || null;
        });

        eventBus.on(GameEventType.RESUME_GAME, () => {
            if (!this.isBusy()) {
                eventBus.emit(GameEventType.GAME_ANIMATIONS_COMPLETE, undefined as any);
            }
        });

        eventBus.on(GameEventType.REQUEST_MARKER_CLEANUP, () => {
            this.clearTransientMarkers();
        });

        eventBus.on(GameEventType.ROGUE_MOVE_SHIP, () => {
            this.visibilityManager.forceUpdate();
        });

        eventBus.on(GameEventType.MINE_PLACED, (payload) => {
            const ship = this.visibilityManager.allShips.find(s => s.specialType === 'mine' && s.headX === payload.x && s.headZ === payload.z);
            if (ship) this.addShip(ship, payload.x, payload.z, Orientation.Horizontal, payload.isPlayer);
        });

        eventBus.on(GameEventType.SONAR_PLACED, (payload) => {
            const ship = this.visibilityManager.allShips.find(s => s.specialType === 'sonar' && s.headX === payload.x && s.headZ === payload.z);
            if (ship) this.addShip(ship, payload.x, payload.z, Orientation.Horizontal, payload.isPlayer);
        });

        eventBus.on(GameEventType.SONAR_RESULTS, (payload) => {
            const { hits } = payload;
            hits.forEach((h: any) => {
                this.fogManager.revealCellTemporarily(h.x, h.z, 2);
            });

            if (hits.length > 0) {
                const targetX = hits[0].x;
                const targetZ = hits[0].z;
                const boardOffset = Config.board.width / 2;
                const worldX = targetX - boardOffset + 0.5;
                const worldZ = targetZ - boardOffset + 0.5;

                this.activeSonarEffects.push(new SonarEffect(worldX, worldZ, 3, this.playerBoardGroup));
            }
        });
    }

    public setPlayerTurn(isPlayerTurn: boolean) {
        this.isPlayerTurn = isPlayerTurn;
    }

    public getInteractableObjects(): readonly THREE.Object3D[] {
        const isEnemyUp = Math.abs(this.masterBoardGroup.rotation.x - Math.PI) < 0.1;
        return isEnemyUp ? this.enemyRaycastPlanes : this.playerRaycastPlanes;
    }

    public showPlayerBoard() {
        this.targetRotationX = 0;
        if (Config.rogueMode) this.fogManager.setParent(this.enemyBoardGroup);
    }

    public showEnemyBoard() {
        this.targetRotationX = Config.rogueMode ? 0 : Math.PI;
        if (Config.rogueMode) this.fogManager.setParent(this.enemyBoardGroup);
    }

    public clearFogCell(x: number, z: number) {
        this.fogManager.clearFogCell(x, z);
    }

    public isCellRevealed(x: number, z: number): boolean {
        return this.fogManager.isCellRevealed(x, z);
    }

    public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
        const isRogue = Config.rogueMode;
        const targetGroup = isRogue ? this.playerBoardGroup : (isPlayer ? this.playerBoardGroup : this.enemyBoardGroup);

        let shipGroup: THREE.Group;
        if (ship.specialType === 'sonar') {
            shipGroup = ShipFactory.createSonarBuoy(isPlayer);
            const boardOffset = Config.board.width / 2;
            shipGroup.position.set(x - boardOffset + 0.5, 0, z - boardOffset + 0.5);
            shipGroup.userData = { isShip: true, ship, shipOrientation: orientation };
            targetGroup.add(shipGroup);
        } else if (ship.specialType === 'mine') {
            shipGroup = ShipFactory.createMine(isPlayer);
            const boardOffset = Config.board.width / 2;
            shipGroup.position.set(x - boardOffset + 0.5, 0.4, z - boardOffset + 0.5);
            shipGroup.userData = { isShip: true, ship, shipOrientation: orientation };
            targetGroup.add(shipGroup);
        } else {
            shipGroup = ShipFactory.createShip(ship, x, z, orientation, isPlayer, targetGroup);
        }

        if (!isPlayer) shipGroup.visible = false;

        // Prevent ghosting: remove old group if it exists
        const oldGroup = this.visibilityManager.getGroupForShip(ship);
        if (oldGroup && oldGroup.parent) {
            oldGroup.parent.remove(oldGroup);
        }

        this.visibilityManager.trackShip(ship, shipGroup);

        const boardOffset = Config.board.width / 2;
        let cx = x, cz = z;
        if (orientation === Orientation.Horizontal) cx += Math.floor(ship.size / 2);
        else if (orientation === Orientation.Vertical) cz += Math.floor(ship.size / 2);
        else if (orientation === Orientation.Left) cx -= Math.floor(ship.size / 2);
        else if (orientation === Orientation.Up) cz -= Math.floor(ship.size / 2);

        this.addRipple(cx - boardOffset + 0.5, cz - boardOffset + 0.5, isPlayer);
    }

    public onTurnChange() {
        this.fogManager.onTurnChange();
    }

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean = false) {
        if (isPlayer && Config.rogueMode) {
            this.fogManager.revealCellTemporarily(x, z);
            if (result === 'sunk') this.revealSunkShip(x, z);
        }
        this.projectileManager.addAttackMarker(x, z, result, isPlayer, isReplay, this.addRipple.bind(this));
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
            parentGroup.remove(targetGroup);
            const newShipGroup = ShipFactory.createShip(ship, ship.headX, ship.headZ, orientation, isPlayer, parentGroup);
            newShipGroup.position.copy(targetGroup.position);
            targetGroup = newShipGroup;
            this.visibilityManager.trackShip(ship, targetGroup);
        }

        const boardOffset = Config.board.width / 2;
        targetGroup.userData.targetPosition = new THREE.Vector3(x - boardOffset + 0.5, 0, z - boardOffset + 0.5);
    }

    public isBusy(): boolean {
        if (this.projectileManager.hasFallingMarkers()) return true;
        if (this.particleSystem.hasActiveParticles()) return true;
        if (this.activeSonarEffects.some(effect => effect.isActive())) return true;

        let isAnimating = false;
        const sinkFloor = Config.visual.sinkingFloor;
        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (child.userData.isShip && ((child.userData.isSinking && child.position.y > sinkFloor) ||
                    (child.userData.targetPosition && child.position.distanceToSquared(child.userData.targetPosition) > 0.001))) {
                    isAnimating = true;
                }
            });
        });
        return isAnimating;
    }

    public update(camera: THREE.Camera) {
        const gameSpeed = Config.timing.gameSpeedMultiplier;

        this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * Config.timing.boardFlipSpeed * gameSpeed;
        this.time += 0.016 * gameSpeed;

        this.fogManager.updateAnimation(this.time, camera);
        this.waterManager.update(this.time, gameSpeed);
        this.visibilityManager.update(this.time);

        this.updateStaticAnimations();
        this.particleSystem.update();

        this.projectileManager.updateProjectiles(this.addRipple.bind(this), this.waterManager.getUniformsForBoard(true), this.waterManager.getUniformsForBoard(false));

        const dt = 1 / 60;
        for (let i = this.activeSonarEffects.length - 1; i >= 0; i--) {
            if (!this.activeSonarEffects[i].update(dt)) {
                this.activeSonarEffects.splice(i, 1);
            }
        }

        const currentBusy = this.isBusy();
        if (this.wasBusy && !currentBusy) eventBus.emit(GameEventType.GAME_ANIMATIONS_COMPLETE, undefined as any);
        this.wasBusy = currentBusy;

        this.updateShipAnimations();
        this.updateShipHighlighting();
        this.updatePlacementHighlight();
    }

    private updateStaticAnimations() {
        this.staticGroup.children.forEach(child => {
            if (child.userData.isStatusLED) {
                const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
                child.userData.phase += 0.05;
                mat.opacity = 0.3 + (0.5 + Math.sin(child.userData.phase) * 0.5) * 0.7;
            }
        });
    }

    private isSetupPhase: boolean = false;
    public setSetupPhase(isSetup: boolean) {
        this.isSetupPhase = isSetup;
        this.fogManager.setSetupPhase(isSetup);
    }

    private placementHighlightMesh?: THREE.Mesh;

    private updatePlacementHighlight() {
        if (!Config.rogueMode || !this.isSetupPhase) {
            if (this.placementHighlightMesh) this.placementHighlightMesh.visible = false;
            return;
        }

        if (!this.placementHighlightMesh) {
            const geo = new THREE.PlaneGeometry(6.9, 6.9);
            const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2, depthWrite: false });
            this.placementHighlightMesh = new THREE.Mesh(geo, mat);
            this.placementHighlightMesh.rotation.x = -Math.PI / 2;
            const offset = Config.board.width / 2;
            // Center of a 7x7 grid from (0,0) to (6,6) is (3,3). 
            // In offset coords, 3 is at (3.5 - offset).
            this.placementHighlightMesh.position.set(3.5 - offset, 0.02, 3.5 - offset);
            this.playerBoardGroup.add(this.placementHighlightMesh);
        }

        this.placementHighlightMesh.visible = true;
        const currentIntensity = 0.1 + ((Math.sin(this.time * 5) + 1) / 2) * 0.2;
        (this.placementHighlightMesh.material as THREE.MeshBasicMaterial).opacity = currentIntensity;
    }

    private addRipple(worldX: number, worldZ: number, isPlayerBoard: boolean) {
        this.waterManager.addRipple(worldX, worldZ, isPlayerBoard);
    }

    private updateShipAnimations() {
        const descentRate = 0.001 * Config.timing.gameSpeedMultiplier;
        const sinkFloor = Config.visual.sinkingFloor;
        const moveLerpFactor = 0.1 * Config.timing.gameSpeedMultiplier;

        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (!child.userData.isShip) return;

                // Sync sinking state from domain
                if (child.userData.ship.isSunk() && !child.userData.isSinking) {
                    child.userData.isSinking = true;
                    child.userData.sinkAngleZ = (Math.random() - 0.5) * 0.3;
                    child.userData.sinkAngleX = (Math.random() - 0.5) * 0.3;
                }

                if (child.userData.isSinking) {
                    // Rule: Mines disappear immediately, ships/sonars sink
                    if (child.userData.ship.specialType === 'mine') {
                        group.remove(child);
                        return;
                    }

                    if (child.position.y > sinkFloor) {
                        child.position.y -= descentRate;
                        const sinkProgress = Math.min(1.0, -child.position.y / Math.abs(sinkFloor));
                        child.rotation.z = sinkProgress * (child.userData.sinkAngleZ ?? 0.15);
                        child.rotation.x = sinkProgress * (child.userData.sinkAngleX ?? 0.08);

                        if (child.userData.isBroken && child.userData.halfA && child.userData.halfB) {
                            const breakAngle = sinkProgress * 0.4;
                            if (child.userData.shipOrientation === Orientation.Horizontal) {
                                child.userData.halfA.rotation.z = breakAngle;
                                child.userData.halfB.rotation.z = -breakAngle;
                            } else {
                                child.userData.halfA.rotation.x = -breakAngle;
                                child.userData.halfB.rotation.x = breakAngle;
                            }
                        }
                    }
                }

                if (child.userData.targetPosition) {
                    child.position.lerp(child.userData.targetPosition, moveLerpFactor);
                    if (child.position.distanceToSquared(child.userData.targetPosition) < 0.001) {
                        child.position.copy(child.userData.targetPosition);
                        child.userData.targetPosition = null;
                    }
                }
            });
        });
    }

    private updateShipHighlighting() {
        const shouldHighlight = Config.rogueMode && this.isPlayerTurn && this.activeRogueShipId;
        const currentIntensity = 0.2 + ((Math.sin(this.time * 5) + 1) / 2) * 0.6;
        const highlightColor = new THREE.Color(0xffff00), defaultColor = new THREE.Color(0x000000);

        this.playerBoardGroup.children.forEach(child => {
            if (child.userData.isShip) {
                const instancedMesh = child.userData.instancedMesh as THREE.InstancedMesh;
                if (instancedMesh?.material instanceof THREE.MeshStandardMaterial) {
                    if (shouldHighlight && child.userData.ship?.id === this.activeRogueShipId) {
                        instancedMesh.material.emissive.copy(highlightColor);
                        instancedMesh.material.emissiveIntensity = currentIntensity;
                    } else if (instancedMesh.material.emissiveIntensity > 0) {
                        instancedMesh.material.emissive.copy(defaultColor);
                        instancedMesh.material.emissiveIntensity = 0;
                    }
                }
            }
        });
    }

    public resetMatch() {
        const disposeShipAndMarkers = (obj: any) => {
            if (obj.userData.isShip || obj.userData.isAttackMarker) {
                if (obj.userData.dispose) obj.userData.dispose();
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
                    else obj.material.dispose();
                }
            }
            if (obj.children) {
                [...obj.children].forEach(child => {
                    if (child.userData.isShip || child.userData.isAttackMarker) {
                        disposeShipAndMarkers(child);
                        obj.remove(child);
                    }
                });
            }
        };

        disposeShipAndMarkers(this.playerBoardGroup);
        disposeShipAndMarkers(this.enemyBoardGroup);
        this.visibilityManager.reset();
        this.particleSystem.clear();
        this.projectileManager.clear();
        this.fogManager.reset();
    }
}
