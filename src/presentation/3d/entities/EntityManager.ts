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

export class EntityManager {
    private scene: THREE.Scene;

    public masterBoardGroup: THREE.Group;
    private staticGroup: THREE.Group;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    private targetRotationX: number = 0;

    private playerGridTiles: THREE.Object3D[] = [];
    private enemyGridTiles: THREE.Object3D[] = [];

    public get boardOrientation(): 'player' | 'enemy' {
        return Math.abs(this.targetRotationX - Math.PI) < 0.1 ? 'enemy' : 'player';
    }

    private time: number = 0;
    private wasBusy: boolean = false;

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

        this.playerGridTiles = buildResult.playerGridTiles;
        this.enemyGridTiles = buildResult.enemyGridTiles;
        
        this.waterManager = new WaterShaderManager(buildResult.playerWaterUniforms, buildResult.enemyWaterUniforms);
        this.visibilityManager = new VesselVisibilityManager(this.fogManager, this.playerBoardGroup, this.enemyBoardGroup);

        this.projectileManager = new ProjectileManager(
            this.particleSystem,
            this.fogManager,
            this.playerBoardGroup,
            this.enemyBoardGroup
        );

        document.addEventListener('ACTIVE_SHIP_CHANGED', (e: Event) => {
            const ce = e as CustomEvent;
            this.activeRogueShipId = ce.detail.ship?.id || null;
        });
    }

    public setPlayerTurn(isPlayerTurn: boolean) {
        this.isPlayerTurn = isPlayerTurn;
    }

    // ───── Public API ─────

    public getInteractableObjects(): readonly THREE.Object3D[] {
        const isEnemyUp = Math.abs(this.masterBoardGroup.rotation.x - Math.PI) < 0.1;
        return isEnemyUp ? this.enemyGridTiles : this.playerGridTiles;
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
        const shipGroup = ShipFactory.createShip(ship, x, z, orientation, isPlayer, targetGroup);

        if (!isPlayer) shipGroup.visible = false;
        this.visibilityManager.trackShip(ship);

        // Trigger water ripple
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

    private revealSunkShip(x: number, z: number) {
        const sunkShip = this.visibilityManager.allShips.find(s => s.isEnemy && s.getOccupiedCoordinates().some(c => c.x === x && c.z === z));
        if (sunkShip) {
            sunkShip.getOccupiedCoordinates().forEach((c: {x: number, z: number}) => {
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
            const isPlayer = parentGroup === this.playerBoardGroup;
            parentGroup.remove(targetGroup);
            const newShipGroup = ShipFactory.createShip(ship, ship.headX, ship.headZ, orientation, isPlayer, parentGroup);
            newShipGroup.position.copy(targetGroup.position); 
            targetGroup = newShipGroup;
        }

        const boardOffset = Config.board.width / 2;
        targetGroup.userData.targetPosition = new THREE.Vector3(x - boardOffset + 0.5, 0, z - boardOffset + 0.5);
    }

    public isBusy(): boolean {
        if (this.projectileManager.hasFallingMarkers()) return true;
        if (this.particleSystem.hasActiveParticles()) return true;

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

    // ───── Update Loop ─────

    public update(camera: THREE.Camera) {
        const gameSpeed = Config.timing.gameSpeedMultiplier;
        
        this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * Config.timing.boardFlipSpeed * gameSpeed;
        this.time += 0.016 * gameSpeed;

        this.fogManager.updateAnimation(this.time, camera);
        this.waterManager.update(this.time, gameSpeed);
        this.visibilityManager.update(this.time);
        
        this.updateStaticAnimations();
        this.particleSystem.update();
        this.projectileManager.updateProjectiles(this.addRipple.bind(this), null, null); 

        const currentBusy = this.isBusy();
        if (this.wasBusy && !currentBusy) document.dispatchEvent(new CustomEvent('GAME_ANIMATIONS_COMPLETE'));
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

    private updatePlacementHighlight() {
        if (!Config.rogueMode || !this.isSetupPhase) return;
        const currentIntensity = 0.1 + ((Math.sin(this.time * 5) + 1) / 2) * 0.3;
        const highlightColor = new THREE.Color(0x00ffff);

        this.playerGridTiles.forEach(tile => {
            const { cellX, cellZ } = tile.userData;
            let isInArea = cellX < 7 && cellZ < 7;
            const mat = (tile as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (isInArea) {
                mat.emissive.copy(highlightColor);
                mat.emissiveIntensity = currentIntensity;
                mat.opacity = 0.3;
            } else {
                mat.emissiveIntensity = 0;
                mat.opacity = 0.05;
            }
        });
    }

    private addRipple(worldX: number, worldZ: number, isPlayerBoard: boolean) {
        this.waterManager.addRipple(worldX, worldZ, isPlayerBoard);
    }

    private updateShipAnimations() {
        const descentRate = 0.005 * Config.timing.gameSpeedMultiplier;
        const sinkFloor = Config.visual.sinkingFloor;
        const moveLerpFactor = 0.1 * Config.timing.gameSpeedMultiplier;

        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (!child.userData.isShip) return;
                if (child.userData.isSinking && child.position.y > sinkFloor) {
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
            if (obj.userData.isShip) {
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
