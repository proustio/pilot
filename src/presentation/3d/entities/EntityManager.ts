import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { ParticleSystem } from './ParticleSystem';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';
import { EntityState } from './EntityState';
import { BoardBuilder } from './BoardBuilder';
import { ShipBuilder } from './ShipBuilder';
import { AttackMarkerBuilder } from './AttackMarkerBuilder';

export class EntityManager {
    private scene: THREE.Scene;
    private state: EntityState;

    public get masterBoardGroup(): THREE.Group { return this.state.masterBoardGroup; }
    private get playerBoardGroup(): THREE.Group { return this.state.playerBoardGroup; }
    private get enemyBoardGroup(): THREE.Group { return this.state.enemyBoardGroup; }
    private get staticGroup(): THREE.Group { return this.state.staticGroup; }

    private targetRotationX: number = 0;
    private wasBusy: boolean = false;
    private time: number = 0;

    private particleSystem: ParticleSystem;

    private boardBuilder: BoardBuilder;
    private shipBuilder: ShipBuilder;
    private attackMarkerBuilder: AttackMarkerBuilder;

    public get boardOrientation(): 'player' | 'enemy' {
        return Math.abs(this.targetRotationX - Math.PI) < 0.1 ? 'enemy' : 'player';
    }

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.state = new EntityState();
        this.particleSystem = new ParticleSystem();

        this.scene.add(this.masterBoardGroup);
        this.scene.add(this.staticGroup);

        this.boardBuilder = new BoardBuilder(this.state);
        this.shipBuilder = new ShipBuilder(this.state);

        // Pass applyImpactEffects so the marker builder can trigger explosions/sinking on replays
        this.attackMarkerBuilder = new AttackMarkerBuilder(this.state, this.applyImpactEffects.bind(this));

        this.boardBuilder.buildBoardMeshes();
    }

    /**
     * Returns the list of objects that the Raycaster should test against.
     * Only returns the tiles that are currently facing UP.
     */
    public getInteractableObjects(): readonly THREE.Object3D[] {
        const isEnemyUp = Math.abs(this.masterBoardGroup.rotation.x - Math.PI) < 0.1;
        if (isEnemyUp) {
            return this.state.enemyGridTiles;
        }
        return this.state.playerGridTiles;
    }

    public showPlayerBoard() {
        this.targetRotationX = 0;
    }

    public showEnemyBoard() {
        this.targetRotationX = Math.PI;
    }

    /**
     * Immediately removes the fog mesh for the given enemy-board cell.
     * Used when restoring game state from a save, so previously-revealed cells
     * are visible instantly without waiting for projectile animations.
     */
    public clearFogCell(x: number, z: number) {
        const fogIdx = getIndex(x, z, Config.board.width);
        const fogMesh = this.state.fogMeshes[fogIdx];
        if (fogMesh) {
            this.enemyBoardGroup.remove(fogMesh);
            this.state.fogMeshes[fogIdx] = null;
        }
    }

    /**
     * Returns true if there are any active animations (projectiles, particles, sinking ships).
     */
    public isBusy(): boolean {
        if (this.state.fallingMarkers.length > 0) return true;
        if (this.particleSystem.hasActiveParticles()) return true;

        // Check for sinking ships
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

    public update() {
        // Smoothly lerp board rotation
        const actualFlipSpeed = Config.timing.boardFlipSpeed * Config.timing.gameSpeedMultiplier;
        this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * actualFlipSpeed;

        // Update water shader time and ripples
        const waterTimeIncrement = 0.016 * Config.timing.gameSpeedMultiplier;
        this.time += waterTimeIncrement;

        // Animate Voxel Fog
        const fogCloudTime = this.time * 2.0;
        const dummy = new THREE.Object3D();
        this.state.fogMeshes.forEach(mesh => {
            if (mesh && mesh.userData.isFog) {
                const im = mesh as THREE.InstancedMesh;
                const vData = mesh.userData.voxelData;
                for (let i = 0; i < im.count; i++) {
                    const data = vData[i];
                    dummy.position.copy(data.basePos);
                    // Slow bobbing
                    dummy.position.y += Math.sin(fogCloudTime * data.speed + data.phase) * 0.1;
                    // Slow rotation
                    dummy.rotation.set(
                        Math.sin(fogCloudTime * 0.5 + data.phase),
                        Math.cos(fogCloudTime * 0.4 + data.phase),
                        Math.sin(fogCloudTime * 0.6 + data.phase)
                    );
                    dummy.updateMatrix();
                    im.setMatrixAt(i, dummy.matrix);
                }
                im.instanceMatrix.needsUpdate = true;
            }
        });

        const updateWater = (uniforms: any) => {
            if (!uniforms) return;
            uniforms.time.value = this.time;
            for (let i = 0; i < 5; i++) {
                if (uniforms.rippleTimes.value[i] > 0) {
                    uniforms.rippleTimes.value[i] += waterTimeIncrement;
                    if (uniforms.rippleTimes.value[i] > (2.0 / Config.timing.gameSpeedMultiplier)) {
                        uniforms.rippleTimes.value[i] = 0; // Stop
                    }
                }
            }
            if (uniforms.globalTurbulence.value > 0) {
                uniforms.globalTurbulence.value = Math.max(0, uniforms.globalTurbulence.value - waterTimeIncrement * 0.2);
            }
        };

        this.staticGroup.children.forEach(child => {
            if (child.userData.isStatusLED) {
                const led = child as THREE.Mesh;
                const mat = led.material as THREE.MeshBasicMaterial;
                child.userData.phase += 0.05;
                const glow = 0.5 + Math.sin(child.userData.phase) * 0.5;
                mat.opacity = 0.3 + glow * 0.7;
            }
        });

        updateWater(this.state.playerWaterUniforms);
        updateWater(this.state.enemyWaterUniforms);

        this.particleSystem.update();

        // Animate falling markers
        for (let i = this.state.fallingMarkers.length - 1; i >= 0; i--) {
            const m = this.state.fallingMarkers[i];
            m.progress += Config.timing.projectileSpeed * Config.timing.gameSpeedMultiplier; // Adjust speed here

            if (m.progress >= 1.0) {
                m.progress = 1.0;
                // On hit, the projectile should embed into the target.
                const finalPos = m.curve.getPoint(1.0);
                m.mesh.position.copy(finalPos);

                // Apply original material, kill glow on hit
                if (m.mesh.userData.instancedMesh) {
                    const im = m.mesh.userData.instancedMesh as THREE.InstancedMesh;
                    const finalMat = m.mesh.userData.originalMat.clone();
                    finalMat.emissive.setHex(0x000000);
                    im.material = finalMat;

                    // Destroy missile voxels based on result
                    const destroyRatio = m.result === 'hit' || m.result === 'sunk' ? 0.60 : 0.30;
                    const dummy = new THREE.Object3D();
                    let destroyedCount = 0;

                    for (let j = 0; j < im.count; j++) {
                        if (Math.random() < destroyRatio) {
                            im.getMatrixAt(j, dummy.matrix);
                            dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                            dummy.scale.set(0, 0, 0);
                            dummy.updateMatrix();
                            im.setMatrixAt(j, dummy.matrix);
                            destroyedCount++;
                        }
                    }
                    im.instanceMatrix.needsUpdate = true;

                    if (destroyedCount > 0) {
                        const tg = m.isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;
                        this.particleSystem.spawnVoxelExplosion(m.worldX, 0.4, m.worldZ, destroyedCount, tg);
                    }
                }

                const targetGroup = m.isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

                // Always spawn water splash on impact (hit or miss)
                this.particleSystem.spawnSplash(m.worldX, 0.2, m.worldZ, targetGroup);

                // Trigger water ripple on impact (not on launch)
                this.state.addRipple(m.worldX, m.worldZ, !m.isPlayer);

                // Sunk-ship turbulence on impact
                if (m.result === 'sunk') {
                    const targetUniforms = m.isPlayer ? this.state.enemyWaterUniforms : this.state.playerWaterUniforms;
                    if (targetUniforms) {
                        targetUniforms.globalTurbulence.value = 0.4;
                    }
                }

                if (m.isPlayer) {
                    this.clearFogCell(m.cellX, m.cellZ);
                }

                if (m.result === 'hit' || m.result === 'sunk') {
                    this.applyImpactEffects(m.cellX, m.cellZ, m.result, m.isPlayer, false);
                } else {
                    // Miss: sink into water partially
                    m.mesh.position.y = -0.15; // Lower it so it looks mostly sunk

                    // Reset rotation to stick straight up or keep original angle
                    m.mesh.rotation.set(0, 0, 0);
                    m.mesh.rotation.x = (Math.random() - 0.5) * 0.5; // Slanted slightly
                    m.mesh.rotation.z = (Math.random() - 0.5) * 0.5;
                }

                if (!m.isReplayFlag) {
                    if (m.result === 'miss') {
                        AudioEngine.getInstance().playSplash();
                    } else if (m.result === 'hit') {
                        AudioEngine.getInstance().playHit();
                    } else if (m.result === 'sunk') {
                        AudioEngine.getInstance().playKill();
                    }
                }

                this.state.fallingMarkers.splice(i, 1);
            } else {
                m.mesh.position.copy(m.curve.getPoint(m.progress));
                // point it towards velocity vector
                const tangent = m.curve.getTangent(m.progress);
                m.mesh.lookAt(m.mesh.position.clone().add(tangent));
            }
        }

        const currentBusy = this.isBusy();
        if (this.wasBusy && !currentBusy) {
            document.dispatchEvent(new CustomEvent('GAME_ANIMATIONS_COMPLETE'));
        }
        this.wasBusy = currentBusy;

        const descentRate = 0.005 * Config.timing.gameSpeedMultiplier;

        const sinkFloor = Config.visual.sinkingFloor;
        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (child.userData.isShip && child.userData.isSinking) {
                    if (child.position.y > sinkFloor) {
                        child.position.y -= descentRate;
                        const sinkProgress = Math.min(1.0, -child.position.y / Math.abs(sinkFloor));

                        // Use randomized target angles stored in userData
                        const targetZ = child.userData.sinkAngleZ ?? 0.15;
                        const targetX = child.userData.sinkAngleX ?? 0.08;

                        child.rotation.z = sinkProgress * targetZ;
                        child.rotation.x = sinkProgress * targetX;
                    }
                }
            });
        });

    }

    public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
        this.shipBuilder.addShip(ship, x, z, orientation, isPlayer);
    }

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean = false) {
        this.attackMarkerBuilder.addAttackMarker(x, z, result, isPlayer, isReplay);
    }

    /**
     * Applies the visual impact of a shot (explosions, smoke, voxel destruction).
     * Can be called for live shots or during replay (load/refresh).
     */
    private applyImpactEffects(cellX: number, cellZ: number, result: string, isPlayer: boolean, isReplay: boolean) {
        const boardOffset = Config.board.width / 2;
        const worldX = cellX - boardOffset + 0.5;
        const worldZ = cellZ - boardOffset + 0.5;
        const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;
        const impactPos = new THREE.Vector3(worldX, 0.4, worldZ);

        if (!isReplay) {
            this.particleSystem.spawnExplosion(worldX, 0.4, worldZ, targetGroup);
        }

        // Add persistent smoke/fire emitter
        this.particleSystem.addEmitter(worldX, 0.4, worldZ, result === 'sunk', targetGroup);

        let voxelsRemoved = 0;

        targetGroup.children.forEach((child: THREE.Object3D) => {
            if (child.userData.isShip && child.userData.instancedMesh && child.userData.coversCell(cellX, cellZ)) {
                const im = child.userData.instancedMesh as THREE.InstancedMesh;
                const dummy = new THREE.Object3D();
                let updated = false;

                const destroyRatio = result === 'sunk' ? 0.85 : 0.25;
                const blastRadius = 0.65;

                for (let i = 0; i < im.count; i++) {
                    im.getMatrixAt(i, dummy.matrix);
                    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

                    if (dummy.scale.x > 0) {
                        const worldVoxelPos = dummy.position.clone();
                        child.localToWorld(worldVoxelPos);

                        if (worldVoxelPos.distanceTo(impactPos) < blastRadius) {
                            if (Math.random() < destroyRatio) {
                                dummy.scale.set(0, 0, 0);
                                dummy.updateMatrix();
                                im.setMatrixAt(i, dummy.matrix);
                                updated = true;
                                voxelsRemoved++;
                            }
                        }
                    }
                }

                if (updated) {
                    im.instanceMatrix.needsUpdate = true;
                }

                // Handle Sinking
                if (result === 'sunk') {
                    if (!child.userData.isSinking) {
                        child.userData.isSinking = true;

                        // Assign random sinking lean if not already set
                        const maxLean = Config.visual.sinkingMaxAngle;
                        child.userData.sinkAngleX = (Math.random() - 0.5) * maxLean * 2;
                        child.userData.sinkAngleZ = (Math.random() - 0.5) * maxLean * 2;
                    }

                    child.visible = true; // Reveal if it was a hidden enemy ship

                    if (isReplay) {
                        // Immediately sink partially
                        child.position.y = Config.visual.sinkingFloor;
                        child.rotation.z = child.userData.sinkAngleZ;
                        child.rotation.x = child.userData.sinkAngleX;

                    } else {
                        // Setup sequential segment explosions
                        const shipGroup = child as THREE.Group;
                        const isHorizontal = shipGroup.userData.coversCell(cellX + 1, cellZ) ||
                            shipGroup.userData.coversCell(cellX - 1, cellZ) ||
                            shipGroup.userData.shipOrientation === Orientation.Horizontal;

                        let minX = cellX, maxX = cellX, minZ = cellZ, maxZ = cellZ;
                        for (let dx = -5; dx <= 5; dx++) {
                            if (shipGroup.userData.coversCell(cellX + dx, cellZ)) {
                                minX = Math.min(minX, cellX + dx);
                                maxX = Math.max(maxX, cellX + dx);
                            }
                        }
                        for (let dz = -5; dz <= 5; dz++) {
                            if (shipGroup.userData.coversCell(cellX, cellZ + dz)) {
                                minZ = Math.min(minZ, cellZ + dz);
                                maxZ = Math.max(maxZ, cellZ + dz);
                            }
                        }

                        const shipLength = Math.max(maxX - minX, maxZ - minZ) + 1;
                        for (let s = 0; s < shipLength; s++) {
                            const delay = s * 0.2 + (Math.random() * 0.1);
                            const ex = (minX + (isHorizontal ? s : 0)) - boardOffset + 0.5;
                            const ez = (minZ + (!isHorizontal ? s : 0)) - boardOffset + 0.5;

                            setTimeout(() => {
                                this.particleSystem.spawnExplosion(ex, 0.4, ez, targetGroup);
                                this.particleSystem.spawnVoxelExplosion(ex, 0.4, ez, 10, targetGroup);
                                this.state.addRipple(ex, ez, !isPlayer);
                            }, delay * 1000);
                        }
                    }
                }
            }
        });

        if (voxelsRemoved > 0 && !isReplay) {
            this.particleSystem.spawnVoxelExplosion(worldX, 0.4, worldZ, voxelsRemoved, targetGroup);
        }
    }
}
