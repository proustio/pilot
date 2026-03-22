import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { BoardBuilder } from './BoardBuilder';
import { ShipFactory } from './ShipFactory';
import { ProjectileManager } from './ProjectileManager';
import { FogManager } from './FogManager';
import { ParticleSystem } from './ParticleSystem';

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
    private playerWaterUniforms: any = null;
    private enemyWaterUniforms: any = null;

    private playerRippleIndex: number = 0;
    private enemyRippleIndex: number = 0;

    private wasBusy: boolean = false;

    // Sub-managers
    private particleSystem: ParticleSystem;
    private fogManager: FogManager;
    private projectileManager: ProjectileManager;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.masterBoardGroup = new THREE.Group();
        this.staticGroup = new THREE.Group();
        this.playerBoardGroup = new THREE.Group();
        this.enemyBoardGroup = new THREE.Group();

        this.particleSystem = new ParticleSystem();
        this.fogManager = new FogManager(this.enemyBoardGroup);

        // Position faces: Player points UP, Enemy points DOWN
        this.playerBoardGroup.position.y = 1.2;
        this.enemyBoardGroup.position.y = -1.2;
        this.enemyBoardGroup.rotation.x = Math.PI; // Flipped upside down

        this.masterBoardGroup.add(this.playerBoardGroup);
        this.masterBoardGroup.add(this.enemyBoardGroup);

        this.scene.add(this.masterBoardGroup);
        this.scene.add(this.staticGroup);

        // Build the board meshes via BoardBuilder
        const buildResult = BoardBuilder.build(
            this.masterBoardGroup,
            this.staticGroup,
            this.playerBoardGroup,
            this.enemyBoardGroup,
            this.fogManager
        );

        this.playerGridTiles = buildResult.playerGridTiles;
        this.enemyGridTiles = buildResult.enemyGridTiles;
        this.playerWaterUniforms = buildResult.playerWaterUniforms;
        this.enemyWaterUniforms = buildResult.enemyWaterUniforms;

        // Create projectile manager with bound addRipple
        this.projectileManager = new ProjectileManager(
            this.particleSystem,
            this.fogManager,
            this.playerBoardGroup,
            this.enemyBoardGroup
        );
    }

    // ───── Public API ─────

    /**
     * Returns the list of objects that the Raycaster should test against.
     * Only returns the tiles that are currently facing UP.
     */
    public getInteractableObjects(): readonly THREE.Object3D[] {
        const isEnemyUp = Math.abs(this.masterBoardGroup.rotation.x - Math.PI) < 0.1;
        return isEnemyUp ? this.enemyGridTiles : this.playerGridTiles;
    }

    public showPlayerBoard() {
        this.targetRotationX = 0;
    }

    public showEnemyBoard() {
        this.targetRotationX = Math.PI;
    }

    public clearFogCell(x: number, z: number) {
        this.fogManager.clearFogCell(x, z);
    }

    public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
        const targetGroup = isPlayer ? this.playerBoardGroup : this.enemyBoardGroup;
        ShipFactory.createShip(ship, x, z, orientation, isPlayer, targetGroup);

        // Trigger water ripple at ship center
        const boardOffset = Config.board.width / 2;
        const cx = orientation === Orientation.Horizontal ? x + Math.floor(ship.size / 2) : x;
        const cz = orientation === Orientation.Vertical ? z + Math.floor(ship.size / 2) : z;
        const rippleWorldX = cx - boardOffset + 0.5;
        const rippleWorldZ = cz - boardOffset + 0.5;
        this.addRipple(rippleWorldX, rippleWorldZ, isPlayer);
    }

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean = false) {
        this.projectileManager.addAttackMarker(
            x, z, result, isPlayer, isReplay,
            this.addRipple.bind(this)
        );
    }

    /**
     * Returns true if there are any active animations (projectiles, particles, sinking ships).
     */
    public isBusy(): boolean {
        if (this.projectileManager.hasFallingMarkers()) return true;
        if (this.particleSystem.hasActiveParticles()) return true;

        let shipsSinking = false;
        const sinkFloor = Config.visual.sinkingFloor;
        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (child.userData.isShip && child.userData.isSinking) {
                    if (child.position.y > sinkFloor) {
                        shipsSinking = true;
                    }
                }
            });
        });

        return shipsSinking;
    }

    // ───── Update Loop ─────

    public update(camera: THREE.Camera) {
        // Board rotation lerp
        const actualFlipSpeed = Config.timing.boardFlipSpeed * Config.timing.gameSpeedMultiplier;
        this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * actualFlipSpeed;

        // Water shader time
        const waterTimeIncrement = 0.016 * Config.timing.gameSpeedMultiplier;
        this.time += waterTimeIncrement;

        // Fog animation
        this.fogManager.updateAnimation(this.time, camera);

        // Water uniforms
        this.updateWater(this.playerWaterUniforms, waterTimeIncrement);
        this.updateWater(this.enemyWaterUniforms, waterTimeIncrement);

        // LED pulsing
        this.staticGroup.children.forEach(child => {
            if (child.userData.isStatusLED) {
                const led = child as THREE.Mesh;
                const mat = led.material as THREE.MeshBasicMaterial;
                child.userData.phase += 0.05;
                const glow = 0.5 + Math.sin(child.userData.phase) * 0.5;
                mat.opacity = 0.3 + glow * 0.7;
            }
        });

        // Particle system
        this.particleSystem.update();

        // Projectile arcs
        this.projectileManager.updateProjectiles(
            this.addRipple.bind(this),
            this.playerWaterUniforms,
            this.enemyWaterUniforms
        );

        // Busy state change event
        const currentBusy = this.isBusy();
        if (this.wasBusy && !currentBusy) {
            document.dispatchEvent(new CustomEvent('GAME_ANIMATIONS_COMPLETE'));
        }
        this.wasBusy = currentBusy;

        // Ship sinking animation
        this.updateSinkingShips();
    }

    // ───── Private Helpers ─────

    private addRipple(worldX: number, worldZ: number, isPlayerBoard: boolean) {
        const uniforms = isPlayerBoard ? this.playerWaterUniforms : this.enemyWaterUniforms;
        let rIndex = isPlayerBoard ? this.playerRippleIndex : this.enemyRippleIndex;

        if (uniforms) {
            uniforms.rippleCenters.value[rIndex].set(worldX, -worldZ);
            uniforms.rippleTimes.value[rIndex] = 0.01;
            rIndex = (rIndex + 1) % 5;

            if (isPlayerBoard) this.playerRippleIndex = rIndex;
            else this.enemyRippleIndex = rIndex;
        }
    }

    private updateWater(uniforms: any, waterTimeIncrement: number) {
        if (!uniforms) return;
        uniforms.time.value = this.time;
        for (let i = 0; i < 5; i++) {
            if (uniforms.rippleTimes.value[i] > 0) {
                uniforms.rippleTimes.value[i] += waterTimeIncrement;
                if (uniforms.rippleTimes.value[i] > (2.0 / Config.timing.gameSpeedMultiplier)) {
                    uniforms.rippleTimes.value[i] = 0;
                }
            }
        }
        if (uniforms.globalTurbulence.value > 0) {
            uniforms.globalTurbulence.value = Math.max(0, uniforms.globalTurbulence.value - waterTimeIncrement * 0.2);
        }
    }

    private updateSinkingShips() {
        const descentRate = 0.005 * Config.timing.gameSpeedMultiplier;
        const sinkFloor = Config.visual.sinkingFloor;

        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (child.userData.isShip && child.userData.isSinking) {
                    if (child.position.y > sinkFloor) {
                        child.position.y -= descentRate;
                        const sinkProgress = Math.min(1.0, -child.position.y / Math.abs(sinkFloor));

                        const targetZ = child.userData.sinkAngleZ ?? 0.15;
                        const targetX = child.userData.sinkAngleX ?? 0.08;

                        child.rotation.z = sinkProgress * targetZ;
                        child.rotation.x = sinkProgress * targetX;

                        // V-Shape Breaking Animation
                        if (child.userData.isBroken && child.userData.halfA && child.userData.halfB) {
                            const breakAngle = sinkProgress * 0.4;
                            const isHorizontal = child.userData.shipOrientation === Orientation.Horizontal;

                            if (isHorizontal) {
                                child.userData.halfA.rotation.z = breakAngle;
                                child.userData.halfB.rotation.z = -breakAngle;
                            } else {
                                child.userData.halfA.rotation.x = -breakAngle;
                                child.userData.halfB.rotation.x = breakAngle;
                            }
                        }
                    }
                }
            });
        });
    }
}
