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

    private allShips: Ship[] = []; // Stores references to domain ships for rogue fog

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

        document.addEventListener('ACTIVE_SHIP_CHANGED', (e: Event) => {
            const ce = e as CustomEvent;
            this.activeRogueShipId = ce.detail.ship?.id || null;
        });
    }

    public setPlayerTurn(isPlayerTurn: boolean) {
        this.isPlayerTurn = isPlayerTurn;
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
        if (Config.rogueMode) {
            this.targetRotationX = 0; // No flipping in Rogue mode
            this.fogManager.setParent(this.enemyBoardGroup); // Shared board is enemy side
        } else {
            this.targetRotationX = 0;
        }
    }

    public showEnemyBoard() {
        if (Config.rogueMode) {
            this.targetRotationX = 0; // No flipping in Rogue mode
            this.fogManager.setParent(this.enemyBoardGroup); // Keep fog on actual board, even when peeking at bottom
        } else {
            this.targetRotationX = Math.PI;
        }
    }

    public clearFogCell(x: number, z: number) {
        this.fogManager.clearFogCell(x, z);
    }

    public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
        const isRogue = Config.rogueMode;
        // In Rogue mode, everything happens on the playerBoardGroup (top side, non-flipped)
        const targetGroup = isRogue ? this.playerBoardGroup : (isPlayer ? this.playerBoardGroup : this.enemyBoardGroup);
        const shipGroup = ShipFactory.createShip(ship, x, z, orientation, isPlayer, targetGroup);

        if (Config.rogueMode && !isPlayer) {
            shipGroup.visible = false;
        }

        if (!this.allShips.includes(ship)) {
            this.allShips.push(ship);
        }

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
     * Smoothly translates the ship's THREE.Group to new board coordinates via lerp in update().
     */
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

        // If orientation changed, we should rebuild the mesh because ShipFactory 
        // bakes orientation into the Voxel Geometry, instead of rotating a shared mesh.
        if (targetGroup.userData.shipOrientation !== orientation) {
            const isPlayer = parentGroup === this.playerBoardGroup;
            parentGroup.remove(targetGroup);
            
            // Create a new one at the exact same world position as previous so it can Lerp
            const newShipGroup = ShipFactory.createShip(ship, ship.headX, ship.headZ, orientation, isPlayer, parentGroup);
            newShipGroup.position.copy(targetGroup.position); 
            targetGroup = newShipGroup;
        }

        const boardOffset = Config.board.width / 2;
        const targetWorldX = x - boardOffset + 0.5;
        const targetWorldZ = z - boardOffset + 0.5;

        targetGroup.userData.targetPosition = new THREE.Vector3(targetWorldX, 0, targetWorldZ);
    }

    /**
     * Returns true if there are any active animations (projectiles, particles, sinking ships, moving ships).
     */
    public isBusy(): boolean {
        if (this.projectileManager.hasFallingMarkers()) return true;
        if (this.particleSystem.hasActiveParticles()) return true;

        let isAnimating = false;
        const sinkFloor = Config.visual.sinkingFloor;
        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (child.userData.isShip && child.userData.isSinking) {
                    if (child.position.y > sinkFloor) {
                        isAnimating = true;
                    }
                }
                if (child.userData.isShip && child.userData.targetPosition) {
                    if (child.position.distanceToSquared(child.userData.targetPosition) > 0.001) {
                        isAnimating = true;
                    }
                }
            });
        });

        return isAnimating;
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

        // Rogue dynamic fog and enemy visibility
        if (this.fogManager.rogueMode) {
            this.fogManager.updateRogueFog(this.allShips);
            
            // Update enemy ship visibility based on fog
            this.allShips.forEach(ship => {
                if (!ship.isEnemy) return;
                
                // Find its 3D group
                let shipGroup: THREE.Group | undefined;
                [this.playerBoardGroup, this.enemyBoardGroup].forEach(bg => {
                    bg.children.forEach(child => {
                        if (child.userData.isShip && child.userData.ship?.id === ship.id) {
                            shipGroup = child as THREE.Group;
                        }
                    });
                });

                if (shipGroup) {
                    const coords = ship.getOccupiedCoordinates();
                    let revealed = false;
                    for (const c of coords) {
                        const fogIdx = c.z * Config.board.width + c.x;
                        const fogMesh = this.fogManager.getFogMesh(fogIdx);
                        // If no fog mesh exists, it's revealed (opacity 0)
                        if (!fogMesh) {
                            revealed = true;
                            break;
                        } else {
                            const mat = (fogMesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
                            if (mat.opacity < 0.2) {
                                revealed = true;
                                break;
                            }
                        }
                    }
                    shipGroup.visible = revealed || ship.isSunk();
                }
            });
        }

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

        // Ship animations (sinking & movement)
        this.updateShipAnimations();

        // Ship highlighting
        this.updateShipHighlighting();

        // Rogue Placement Area Highlighting
        this.updatePlacementHighlight();
    }

    private isSetupPhase: boolean = false;

    public setSetupPhase(isSetup: boolean) {
        this.isSetupPhase = isSetup;
        this.fogManager.setSetupPhase(isSetup);
    }

    private updatePlacementHighlight() {
        if (!Config.rogueMode || !this.isSetupPhase) {
            // Reset any remaining highlights if we just left setup
            return;
        }

        const throb = (Math.sin(this.time * 5) + 1) / 2;
        const currentIntensity = 0.1 + throb * 0.3;
        const highlightColor = new THREE.Color(0x00ffff);

        this.playerGridTiles.forEach(tile => {
            const { cellX, cellZ } = tile.userData;
            // Player placement area: Top-Left 10x10 (0-9, 0-9)
            let isInArea = cellX < 7 && cellZ < 7;
            
            const mesh = tile as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            
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

    private updateShipAnimations() {
        const descentRate = 0.005 * Config.timing.gameSpeedMultiplier;
        const sinkFloor = Config.visual.sinkingFloor;
        const moveLerpFactor = 0.1 * Config.timing.gameSpeedMultiplier;

        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (child.userData.isShip) {
                    // Sinking logic
                    if (child.userData.isSinking && child.position.y > sinkFloor) {
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

                    // Movement logic
                    if (child.userData.targetPosition) {
                        child.position.lerp(child.userData.targetPosition, moveLerpFactor);
                        if (child.position.distanceToSquared(child.userData.targetPosition) < 0.001) {
                            child.position.copy(child.userData.targetPosition);
                            child.userData.targetPosition = null;
                        }
                    }
                }
            });
        });
    }

    private updateShipHighlighting() {
        const shouldHighlight = Config.rogueMode && this.isPlayerTurn && this.activeRogueShipId;
        
        // Throb between 0.2 and 0.8
        const throb = (Math.sin(this.time * 5) + 1) / 2;
        const currentIntensity = 0.2 + throb * 0.6;
        const highlightColor = new THREE.Color(0xffff00);
        const defaultColor = new THREE.Color(0x000000);

        this.playerBoardGroup.children.forEach(child => {
            if (child.userData.isShip) {
                const isActive = shouldHighlight && child.userData.ship?.id === this.activeRogueShipId;
                const instancedMesh = child.userData.instancedMesh as THREE.InstancedMesh;
                
                if (instancedMesh && instancedMesh.material instanceof THREE.MeshStandardMaterial) {
                    if (isActive) {
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

    public isCellRevealed(x: number, z: number): boolean {
        return this.fogManager.isCellRevealed(x, z);
    }
}
