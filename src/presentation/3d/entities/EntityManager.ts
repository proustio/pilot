import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { BoardBuilder } from './BoardBuilder';
import { ProjectileManager } from './ProjectileManager';
import { FogManager } from './FogManager';
import { ParticleSystem } from './ParticleSystem';
import { WaterShaderManager } from './WaterShaderManager';
import { VesselVisibilityManager } from './VesselVisibilityManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { ShipAnimator } from './ShipAnimator';
import { TurretInstanceManager } from './TurretInstanceManager';
import { AnimationStateTracker } from './AnimationStateTracker';
import { ShipPlacementCoordinator } from './ShipPlacementCoordinator';
import { EntityEventCoordinator } from './EntityEventCoordinator';
import { AttackMarkerManager } from './AttackMarkerManager';

export class EntityManager {
    private scene: THREE.Scene;

    public masterBoardGroup: THREE.Group;
    private staticGroup: THREE.Group;
    public playerBoardGroup: THREE.Group;
    public enemyBoardGroup: THREE.Group;

    private targetRotationX: number = 0;

    private playerRaycastPlanes: THREE.Object3D[] = [];
    private enemyRaycastPlanes: THREE.Object3D[] = [];

    public get boardOrientation(): 'player' | 'enemy' {
        return Math.abs(this.targetRotationX - Math.PI) < 0.1 ? 'enemy' : 'player';
    }

    private time: number = 0;
    private wasBusy: boolean = false;

    // Sub-managers
    public particleSystem: ParticleSystem;
    public fogManager: FogManager;
    private projectileManager: ProjectileManager;
    public waterManager: WaterShaderManager;
    public visibilityManager: VesselVisibilityManager;
    public shipAnimator: ShipAnimator;
    public animationTracker: AnimationStateTracker;

    public activeRogueShipId: string | null = null;
    private isPlayerTurn: boolean = false;

    // Turret instancing managers (one per board side)
    private playerTurretManager: TurretInstanceManager;
    private enemyTurretManager: TurretInstanceManager;

    // Coordinators
    public shipPlacementCoordinator: ShipPlacementCoordinator;
    public attackMarkerManager: AttackMarkerManager;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.masterBoardGroup = new THREE.Group();
        this.staticGroup = new THREE.Group();
        this.playerBoardGroup = new THREE.Group();
        this.enemyBoardGroup = new THREE.Group();

        this.particleSystem = new ParticleSystem();
        this.particleSystem.initPools(this.masterBoardGroup);
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

        this.shipAnimator = new ShipAnimator(this.playerBoardGroup, this.enemyBoardGroup);

        this.playerTurretManager = new TurretInstanceManager(this.playerBoardGroup, true);
        this.enemyTurretManager = new TurretInstanceManager(this.enemyBoardGroup, false);

        this.animationTracker = new AnimationStateTracker(
            this.playerBoardGroup,
            this.enemyBoardGroup,
            this.playerTurretManager,
            this.enemyTurretManager
        );
        this.animationTracker.setLedMesh(buildResult.ledMesh, buildResult.ledPhases);

        this.shipPlacementCoordinator = new ShipPlacementCoordinator(
            this.playerBoardGroup,
            this.enemyBoardGroup,
            this.playerTurretManager,
            this.enemyTurretManager,
            this.visibilityManager,
            this.shipAnimator,
            this.addRipple.bind(this)
        );

        this.attackMarkerManager = new AttackMarkerManager(
            this.playerBoardGroup,
            this.enemyBoardGroup,
            this.projectileManager,
            this.fogManager,
            this.visibilityManager,
            this.addRipple.bind(this)
        );

        new EntityEventCoordinator(this);
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
        this.shipPlacementCoordinator.addShip(ship, x, z, orientation, isPlayer);
    }

    public onTurnChange() {
        this.fogManager.onTurnChange();
    }

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean = false) {
        this.attackMarkerManager.addAttackMarker(x, z, result, isPlayer, isReplay);
    }

    public clearTransientMarkers() {
        this.attackMarkerManager.clearTransientMarkers();
    }

    public moveShip3D(ship: Ship, x: number, z: number, orientation: Orientation) {
        this.shipPlacementCoordinator.moveShip3D(ship, x, z, orientation);
    }

    public getEmitterStats(): { emitterCount: number; throttleFactor: number } {
        return this.particleSystem.getEmitterStats();
    }

    public isBusy(): boolean {
        return this.animationTracker.isBusy(
            this.projectileManager,
            this.particleSystem,
            this.shipAnimator
        );
    }

    public update(camera: THREE.Camera, renderer?: THREE.WebGLRenderer) {
        const gameSpeed = Config.timing.gameSpeedMultiplier;

        this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * Config.timing.boardFlipSpeed * gameSpeed;
        this.time += 0.016 * gameSpeed;

        this.fogManager.updateAnimation(this.time, camera);
        this.waterManager.update(this.time, gameSpeed);
        this.visibilityManager.update(this.time);

        this.particleSystem.update();

        // Draw call budget enforcement (Req 5.1–5.4)
        if (renderer) {
            const drawCalls = renderer.info.render.calls;
            const budget = Config.particles.drawCallBudget;
            if (drawCalls > budget) {
                const scale = Math.max(Config.particles.minSpawnRateScale, budget / drawCalls);
                this.particleSystem.spawnRateScale = scale;
            } else {
                this.particleSystem.spawnRateScale = 1.0;
            }
        }

        this.projectileManager.updateProjectiles(this.addRipple.bind(this), this.waterManager.getUniformsForBoard(true), this.waterManager.getUniformsForBoard(false));

        const currentBusy = this.isBusy();
        if (!this.wasBusy && currentBusy) {
            console.log(`[${new Date().toISOString()}] EntityManager: Board animations started`);
        }
        if (this.wasBusy && !currentBusy) {
            console.log(`[${new Date().toISOString()}] EntityManager: Board animations completed`);
            eventBus.emit(GameEventType.GAME_ANIMATIONS_COMPLETE, undefined as any);
        }
        this.wasBusy = currentBusy;

        this.shipAnimator.update(this.time, this.activeRogueShipId, this.isPlayerTurn, this.isSetupPhase);

        // Delegate animation-state updates (LED, sonar, ramming, shake, turrets)
        this.animationTracker.update(camera);
    }



    private isSetupPhase: boolean = false;
    public setSetupPhase(isSetup: boolean) {
        this.isSetupPhase = isSetup;
        this.fogManager.setSetupPhase(isSetup);
        this.animationTracker.setSetupPhase(isSetup);
        this.visibilityManager.setSetupPhase(isSetup);
    }

    private addRipple(worldX: number, worldZ: number, isPlayerBoard: boolean) {
        this.waterManager.addRipple(worldX, worldZ, isPlayerBoard);
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
        this.shipAnimator.clearShipMeshes();

        // Dispose and recreate turret managers for the new match
        this.playerTurretManager.dispose();
        this.enemyTurretManager.dispose();
        this.playerTurretManager = new TurretInstanceManager(this.playerBoardGroup, true);
        this.enemyTurretManager = new TurretInstanceManager(this.enemyBoardGroup, false);
        this.animationTracker.setTurretManagers(this.playerTurretManager, this.enemyTurretManager);
    }
}
