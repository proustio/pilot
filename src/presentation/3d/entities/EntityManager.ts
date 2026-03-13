import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { WaterShader } from '../materials/WaterShader';
import { ParticleSystem } from './ParticleSystem';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';

export class EntityManager {
    private scene: THREE.Scene;

    public masterBoardGroup: THREE.Group;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    private targetRotationX: number = 0;

    public get boardOrientation(): 'player' | 'enemy' {
        return Math.abs(this.targetRotationX - Math.PI) < 0.1 ? 'enemy' : 'player';
    }
    private fogMeshes: (THREE.Mesh | null)[] = new Array(Config.board.width * Config.board.height).fill(null);
    private fallingMarkers: { mesh: THREE.Object3D, curve: THREE.QuadraticBezierCurve3, progress: number, worldX: number, worldZ: number, result: string, isPlayer: boolean, cellX: number, cellZ: number }[] = [];

    private time: number = 0;
    private playerWaterUniforms: any = null;
    private enemyWaterUniforms: any = null;

    private playerRippleIndex: number = 0;
    private enemyRippleIndex: number = 0;

    private particleSystem: ParticleSystem;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.masterBoardGroup = new THREE.Group();
        this.playerBoardGroup = new THREE.Group();
        this.enemyBoardGroup = new THREE.Group();

        this.particleSystem = new ParticleSystem();

        // Position faces: Player points UP, Enemy points DOWN
        this.playerBoardGroup.position.y = 1.2;

        this.enemyBoardGroup.position.y = -1.2;
        this.enemyBoardGroup.rotation.x = Math.PI; // Flipped upside down

        this.masterBoardGroup.add(this.playerBoardGroup);
        this.masterBoardGroup.add(this.enemyBoardGroup);
        this.scene.add(this.masterBoardGroup);

        this.createBoardMeshes();

        // Removed disconnected SET_FLIP_SPEED listener
    }

    private createBoardMeshes() {
        const boardSize = Config.board.width;
        const offset = boardSize / 2;

        const createWaterUniforms = (isEnemy: boolean) => ({
            time: { value: 0 },
            baseColor: { value: isEnemy ? new THREE.Color(0xFF9900) : new THREE.Color(0x800080) }, // Orange/Yellowish vs Pinkish/Magenta base
            peakColor: { value: isEnemy ? new THREE.Color(0xFFCC33) : new THREE.Color(0xFF6666) }, // Brighter peaks
            opacity: { value: 0.85 },
            globalTurbulence: { value: 0.0 },
            rippleCenters: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
            rippleTimes: { value: [0.0, 0.0, 0.0, 0.0, 0.0] }
        });

        // Create the "Master Metal Frame" (hollow inside)
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x330033, // Dark Purple
            metalness: 0.6,
            roughness: 0.3
        });

        const borderOffset = offset + 0.25;
        const borderLength = boardSize + 1;
        const borders = [
            { x: borderLength, z: 0.5, posZ: -borderOffset, posX: 0 },  // Top
            { x: borderLength, z: 0.5, posZ: borderOffset, posX: 0 },   // Bottom
            { x: 0.5, z: boardSize, posZ: 0, posX: -borderOffset },   // Left
            { x: 0.5, z: boardSize, posZ: 0, posX: borderOffset }     // Right
        ];

        borders.forEach(b => {
            // Slight roundness using beveling would be complex with standard BoxGeometry
            // but we can rely on standard boxes with a shiny mat.
            const borderGeo = new THREE.BoxGeometry(b.x, 2.4, b.z);
            const borderMesh = new THREE.Mesh(borderGeo, frameMat);
            borderMesh.position.set(b.posX, 0, b.posZ);
            borderMesh.castShadow = true;
            borderMesh.receiveShadow = true;
            this.masterBoardGroup.add(borderMesh);
        });

        // Bottom plane separating the two sides
        const bottomGeo = new THREE.PlaneGeometry(boardSize, boardSize);
        const bottomMat = new THREE.MeshStandardMaterial({
            color: 0x660066, // Magenta
            metalness: 0.4,
            roughness: 0.6,
            side: THREE.DoubleSide
        });
        const bottomPlane = new THREE.Mesh(bottomGeo, bottomMat);
        bottomPlane.rotation.x = -Math.PI / 2;
        bottomPlane.position.y = 0;
        bottomPlane.receiveShadow = true;
        this.masterBoardGroup.add(bottomPlane);

        // Create water panes for the boards
        const boardWaterGeo = new THREE.PlaneGeometry(boardSize, boardSize, 32, 32);

        this.playerWaterUniforms = createWaterUniforms(false); // Player water (pinkish/purple)
        const playerWaterMat = new THREE.ShaderMaterial({
            vertexShader: WaterShader.vertexShader,
            fragmentShader: WaterShader.fragmentShader,
            uniforms: this.playerWaterUniforms,
            transparent: true,
            side: THREE.FrontSide
        });
        const playerWaterPlane = new THREE.Mesh(boardWaterGeo, playerWaterMat);
        playerWaterPlane.rotation.x = -Math.PI / 2;
        playerWaterPlane.position.y = -0.25; // Slightly recessed from top
        playerWaterPlane.receiveShadow = true;
        this.playerBoardGroup.add(playerWaterPlane);

        this.enemyWaterUniforms = createWaterUniforms(true); // Enemy water (orange/yellow)
        const enemyWaterMat = new THREE.ShaderMaterial({
            vertexShader: WaterShader.vertexShader,
            fragmentShader: WaterShader.fragmentShader,
            uniforms: this.enemyWaterUniforms,
            transparent: true,
            side: THREE.FrontSide
        });
        const enemyWaterPlane = new THREE.Mesh(boardWaterGeo, enemyWaterMat);
        enemyWaterPlane.rotation.x = -Math.PI / 2;
        enemyWaterPlane.position.y = -0.25; // Slightly recessed
        enemyWaterPlane.receiveShadow = true;
        this.enemyBoardGroup.add(enemyWaterPlane);

        // Create interactable grid tiles (invisible or somewhat transparent borders)
        const tileGeometry = new THREE.BoxGeometry(0.95, 0.1, 0.95);
        const tilePlayerMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, transparent: true, opacity: 0.2, depthWrite: false });
        const tileEnemyMat = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.2, depthWrite: false });

        // Animated Voxel Fog
        const fogVoxelGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const fogMat = new THREE.MeshStandardMaterial({
            color: 0x555555, // Darker grey to be denser
            transparent: true,
            opacity: 0.95, // Higher opacity
            roughness: 0.9
        });

        for (let x = 0; x < boardSize; x++) {
            for (let z = 0; z < boardSize; z++) {
                const worldX = x - offset + 0.5;
                const worldZ = z - offset + 0.5;

                // Player Side tile
                const ptile = new THREE.Mesh(tileGeometry, tilePlayerMat);
                ptile.position.set(worldX, 0, worldZ);
                ptile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: true };
                this.playerBoardGroup.add(ptile);

                // Enemy Side tile
                const etile = new THREE.Mesh(tileGeometry, tileEnemyMat);
                etile.position.set(worldX, 0, worldZ);
                etile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: false };
                this.enemyBoardGroup.add(etile);

                // Voxel Fog cloud per cell - increased voxel count for density
                const numVoxels = 30;
                const fogCloud = new THREE.InstancedMesh(fogVoxelGeo, fogMat, numVoxels);
                fogCloud.position.set(worldX, 0.3, worldZ);

                const dummy = new THREE.Object3D();
                const voxelData = [];
                for (let i = 0; i < numVoxels; i++) {
                    // Spread a bit wider and taller to completely obscure cell
                    const vx = (Math.random() - 0.5) * 0.85;
                    const vy = (Math.random() - 0.5) * 0.6;
                    const vz = (Math.random() - 0.5) * 0.85;
                    dummy.position.set(vx, vy, vz);
                    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    dummy.scale.setScalar(0.8 + Math.random() * 0.6);
                    dummy.updateMatrix();
                    fogCloud.setMatrixAt(i, dummy.matrix);

                    voxelData.push({
                        basePos: new THREE.Vector3(vx, vy, vz),
                        phase: Math.random() * Math.PI * 2,
                        speed: 0.5 + Math.random() * 1.5
                    });
                }
                fogCloud.userData = { isFog: true, voxelData: voxelData };

                this.enemyBoardGroup.add(fogCloud);
                this.fogMeshes[z * boardSize + x] = fogCloud;
            }
        }

        // GridHelpers for visual debug
        const pGrid = new THREE.GridHelper(boardSize, boardSize, 0xffffff, 0xffffff);
        pGrid.position.y = 0.05;
        pGrid.material.transparent = true; pGrid.material.opacity = 0.5;
        this.playerBoardGroup.add(pGrid);

        const eGrid = new THREE.GridHelper(boardSize, boardSize, 0xffffff, 0xffffff);
        eGrid.position.y = 0.05;
        eGrid.material.transparent = true; eGrid.material.opacity = 0.5;
        this.enemyBoardGroup.add(eGrid);
    }

    /**
     * Returns the list of objects that the Raycaster should test against.
     * Only returns the tiles that are currently facing UP.
     */
    public getInteractableObjects(): THREE.Object3D[] {
        // Determine which side is facing up by looking at rotation
        // Math.PI rotation means enemy board is UP
        const isEnemyUp = Math.abs(this.masterBoardGroup.rotation.x - Math.PI) < 0.1;
        if (isEnemyUp) {
            return this.enemyBoardGroup.children.filter(c => c.userData.isGridTile);
        }
        return this.playerBoardGroup.children.filter(c => c.userData.isGridTile);
    }

    public showPlayerBoard() {
        this.targetRotationX = 0;
    }

    public showEnemyBoard() {
        this.targetRotationX = Math.PI;
    }

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

    /**
     * Immediately removes the fog mesh for the given enemy-board cell.
     * Used when restoring game state from a save, so previously-revealed cells
     * are visible instantly without waiting for projectile animations.
     */
    public clearFogCell(x: number, z: number) {
        const fogIdx = getIndex(x, z, Config.board.width);
        const fogMesh = this.fogMeshes[fogIdx];
        if (fogMesh) {
            this.enemyBoardGroup.remove(fogMesh);
            this.fogMeshes[fogIdx] = null;
        }
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
        this.fogMeshes.forEach(mesh => {
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

        updateWater(this.playerWaterUniforms);
        updateWater(this.enemyWaterUniforms);

        this.particleSystem.update();

        // Animate falling markers
        for (let i = this.fallingMarkers.length - 1; i >= 0; i--) {
            const m = this.fallingMarkers[i];
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
                this.addRipple(m.worldX, m.worldZ, !m.isPlayer);

                // Sunk-ship turbulence on impact
                if (m.result === 'sunk') {
                    const targetUniforms = m.isPlayer ? this.enemyWaterUniforms : this.playerWaterUniforms;
                    if (targetUniforms) {
                        targetUniforms.globalTurbulence.value = 0.4;
                    }
                }

                // Reveal Fog
                if (m.isPlayer) {
                    const fogIdx = getIndex(m.cellX, m.cellZ, Config.board.width);
                    const fogMesh = this.fogMeshes[fogIdx];
                    if (fogMesh) {
                        this.enemyBoardGroup.remove(fogMesh);
                        this.fogMeshes[fogIdx] = null;
                    }
                }

                if (m.result === 'hit' || m.result === 'sunk') {
                    // Projectile voxel explosion already handled above

                    // Spawn basic explosion
                    this.particleSystem.spawnExplosion(m.worldX, 0.4, m.worldZ, targetGroup);
                    // Start emitter for smoke
                    this.particleSystem.addEmitter(m.worldX, 0.4, m.worldZ, m.result === 'sunk', targetGroup);

                    // Handle Voxel Destruction
                    const impactPos = new THREE.Vector3(m.worldX, 0.4, m.worldZ);
                    let voxelsRemoved = 0;

                    targetGroup.children.forEach(child => {
                        if (child.userData.isShip && child.userData.instancedMesh && child.userData.coversCell(m.cellX, m.cellZ)) {
                            const im = child.userData.instancedMesh as THREE.InstancedMesh;
                            const dummy = new THREE.Object3D();
                            let updated = false;

                            // Percentage of voxels within radius to destroy
                            const destroyRatio = m.result === 'sunk' ? 0.85 : 0.25;
                            const blastRadius = 0.65; // Fixed radius to identify "part" voxels

                            for (let i = 0; i < im.count; i++) {
                                im.getMatrixAt(i, dummy.matrix);
                                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

                                if (dummy.scale.x > 0) {
                                    // Transform dummy local position to world position
                                    const worldVoxelPos = dummy.position.clone();
                                    child.localToWorld(worldVoxelPos);

                                    // If voxel is within radius and passes probability check
                                    if (worldVoxelPos.distanceTo(impactPos) < blastRadius) {
                                        if (Math.random() < destroyRatio) {
                                            dummy.scale.set(0, 0, 0); // "Destroy" voxel
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
                            if (m.result === 'sunk') {
                                child.userData.isSinking = true;
                                child.visible = true; // Reveal if it was a hidden enemy ship

                                // Setup sequential segment explosions based on ship size and orientation
                                const shipGroup = child as THREE.Group;
                                const isHorizontal = shipGroup.userData.coversCell(m.cellX + 1, m.cellZ) || shipGroup.userData.coversCell(m.cellX - 1, m.cellZ) || shipGroup.userData.shipOrientation === Orientation.Horizontal;

                                // We can infer length from number of voxels roughly or just test coversCell
                                let minX = m.cellX;
                                let maxX = m.cellX;
                                let minZ = m.cellZ;
                                let maxZ = m.cellZ;

                                for (let dx = -5; dx <= 5; dx++) {
                                    if (shipGroup.userData.coversCell(m.cellX + dx, m.cellZ)) {
                                        minX = Math.min(minX, m.cellX + dx);
                                        maxX = Math.max(maxX, m.cellX + dx);
                                    }
                                }
                                for (let dz = -5; dz <= 5; dz++) {
                                    if (shipGroup.userData.coversCell(m.cellX, m.cellZ + dz)) {
                                        minZ = Math.min(minZ, m.cellZ + dz);
                                        maxZ = Math.max(maxZ, m.cellZ + dz);
                                    }
                                }

                                const shipLength = Math.max(maxX - minX, maxZ - minZ) + 1;

                                // Launch sequence of explosions along the true length of the ship
                                for (let s = 0; s < shipLength; s++) {
                                    const delay = s * 0.2 + (Math.random() * 0.1);

                                    const ex = (minX + (isHorizontal ? s : 0)) - (Config.board.width / 2) + 0.5;
                                    const ez = (minZ + (!isHorizontal ? s : 0)) - (Config.board.width / 2) + 0.5;

                                    setTimeout(() => {
                                        this.particleSystem.spawnExplosion(ex, 0.4, ez, targetGroup);
                                        this.particleSystem.spawnVoxelExplosion(ex, 0.4, ez, 10, targetGroup);
                                        // add water ripple
                                        this.addRipple(ex, ez, !m.isPlayer);
                                    }, delay * 1000);
                                }
                            }
                        }
                    });

                    if (voxelsRemoved > 0) {
                        this.particleSystem.spawnVoxelExplosion(m.worldX, 0.4, m.worldZ, voxelsRemoved, targetGroup);
                    }
                } else {
                    // Miss: sink into water partially
                    m.mesh.position.y = -0.15; // Lower it so it looks mostly sunk

                    // Reset rotation to stick straight up or keep original angle
                    m.mesh.rotation.set(0, 0, 0);
                    m.mesh.rotation.x = (Math.random() - 0.5) * 0.5; // Slanted slightly
                    m.mesh.rotation.z = (Math.random() - 0.5) * 0.5;
                }
                this.fallingMarkers.splice(i, 1);
            } else {
                m.mesh.position.copy(m.curve.getPoint(m.progress));
                // point it towards velocity vector
                const tangent = m.curve.getTangent(m.progress);
                m.mesh.lookAt(m.mesh.position.clone().add(tangent));
            }
        }

        // Animate Sinking Ships
        const descentRate = 0.005 * Config.timing.gameSpeedMultiplier;
        const sinkFloor = -1.1; // Rest just above the sand bottom (world y ≈ 0.1)
        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach(child => {
                if (child.userData.isShip && child.userData.isSinking) {
                    if (child.position.y > sinkFloor) {
                        child.position.y -= descentRate;
                        // Add a gentle settling tilt as ship sinks
                        const sinkProgress = Math.min(1.0, -child.position.y / Math.abs(sinkFloor));
                        child.rotation.z = sinkProgress * 0.15; // Subtle lean
                        child.rotation.x = sinkProgress * 0.08; // Slight forward pitch
                    }
                }
            });
        });
    }

    public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
        const targetGroup = isPlayer ? this.playerBoardGroup : this.enemyBoardGroup;

        // Create a parent group for the whole ship
        const shipGroup = new THREE.Group();
        shipGroup.userData = {
            isShip: true,
            isSinking: false,
            shipOrientation: orientation,
            coversCell: (tx: number, tz: number) => {
                if (orientation === Orientation.Horizontal) {
                    return tz === z && tx >= x && tx < x + ship.size;
                } else {
                    return tx === x && tz >= z && tz < z + ship.size;
                }
            }
        };

        // Position ship group at the ship's origin cell
        const boardOffset = Config.board.width / 2;
        const originWorldX = x - boardOffset + 0.5;
        const originWorldZ = z - boardOffset + 0.5;
        shipGroup.position.set(originWorldX, 0, originWorldZ);
        shipGroup.visible = isPlayer; // Hide enemy ships initially

        // --- Color palette ---
        // Player: Yellowish orange tones, Enemy: Pinkish purple tones
        const hullColor = isPlayer ? new THREE.Color(0xFF9900) : new THREE.Color(0x800080);
        const deckColor = isPlayer ? new THREE.Color(0xFFCC33) : new THREE.Color(0xFF6666);
        const accentColor = isPlayer ? new THREE.Color(0xFFCC00) : new THREE.Color(0xFF9999);
        const bridgeColor = isPlayer ? new THREE.Color(0xFFCC33) : new THREE.Color(0xFF6666);
        const darkAccent = isPlayer ? new THREE.Color(0xCC7A00) : new THREE.Color(0x4d004d);

        // Build the ship from tiny voxels using InstancedMesh
        const voxelSize = 0.1;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        const length = orientation === Orientation.Horizontal ? ship.size : 1;
        const width = orientation === Orientation.Vertical ? ship.size : 1;

        const voxelsData: { pos: THREE.Vector3, color: THREE.Color }[] = [];

        const L = ship.size * 10;
        const centerX = L / 2 - 0.5;

        // Custom designs based on ship size
        const isCarrier = ship.size === 5;
        const isBattleship = ship.size === 4;
        const isDestroyer = ship.size === 3;

        const getHullWidth = (xNorm: number): number => {
            const absX = Math.abs(xNorm);
            if (isCarrier) {
                // Wide flat deck, tapers sharply at ends
                if (absX > 0.8) return 2.0 + 3.0 * (1.0 - (absX - 0.8) / 0.2);
                return 5.0;
            } else if (isBattleship) {
                // Thicker middle, steady taper
                if (absX > 0.7) return 1.5 + 2.5 * (1.0 - (absX - 0.7) / 0.3);
                return 4.0;
            } else if (isDestroyer) {
                // Slimmer body
                if (absX > 0.6) return 1.0 + 2.0 * (1.0 - (absX - 0.6) / 0.4);
                return 3.0;
            } else {
                // Patrol boat, tiny taper
                if (absX > 0.5) return 1.0 + 1.0 * (1.0 - (absX - 0.5) / 0.5);
                return 2.0;
            }
        };

        const getBridgeHeight = (xNorm: number, isEdge: boolean, shipWidthPos: number, maxW: number): number => {
            const absX = Math.abs(xNorm);
            if (isCarrier) {
                // Island on one side
                const isIslandSide = (maxW - shipWidthPos) <= 2.0; // right side
                if (absX < 0.2 && isIslandSide && !isEdge) return 4;
                return 1; // Flat deck elsewhere
            } else if (isBattleship) {
                // Tall central tower
                if (absX < 0.15 && !isEdge) return 5;
                if (absX < 0.3 && !isEdge) return 3;
                return 1;
            } else if (isDestroyer) {
                // Medium bridge
                if (xNorm > -0.2 && xNorm < 0.1 && !isEdge) return 3;
                return 1;
            } else {
                // Small cabin in back
                if (xNorm > 0.0 && xNorm < 0.4 && !isEdge) return 2;
                return 1;
            }
        };

        for (let lx = 0; lx < length * 10; lx++) {
            for (let lz = 0; lz < width * 10; lz++) {
                const shipLengthPos = orientation === Orientation.Horizontal ? lx : lz;
                const shipWidthPos = orientation === Orientation.Horizontal ? lz : lx;

                const xNorm = (shipLengthPos - centerX) / (L / 2);
                const halfWidth = getHullWidth(xNorm);
                const center = 4.5;
                const minW = center - halfWidth;
                const maxW = center + halfWidth;

                if (shipWidthPos >= Math.floor(minW) && shipWidthPos <= Math.ceil(maxW)) {
                    const isEdge = (shipWidthPos - minW) < 1.0 || (maxW - shipWidthPos) < 1.0;
                    const isBowStern = Math.abs(xNorm) > 0.85;

                    let maxLy = getBridgeHeight(xNorm, isEdge, shipWidthPos, maxW);

                    // Bow rise
                    if (isEdge || isBowStern) {
                        const bowRise = isCarrier ? 0 : Math.pow(Math.max(0, Math.abs(xNorm) - 0.7) / 0.3, 2) * 2;
                        maxLy = Math.max(maxLy, 2 + bowRise);
                    }

                    for (let ly = 1; ly <= maxLy; ly++) {
                        let color = hullColor;
                        if (ly === maxLy && !isEdge) {
                            color = deckColor;
                            // Add carrier deck lines
                            if (isCarrier && !isEdge && shipWidthPos === Math.floor(center)) {
                                color = darkAccent;
                            }
                        } else if (isEdge && ly > 1) {
                            color = accentColor;
                        } else if (ly > 2 && !isEdge) {
                            color = bridgeColor;
                            // Windows
                            if (ly === maxLy && (lx % 2 === 0)) color = darkAccent;
                        }

                        voxelsData.push({
                            pos: new THREE.Vector3(
                                lx * voxelSize - (voxelSize / 2 * 9),
                                ly * voxelSize,
                                lz * voxelSize - (voxelSize / 2 * 9)
                            ),
                            color
                        });
                    }
                }
            }
        }

        const shipMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.4,
            metalness: 0.5
        });

        const instancedMesh = new THREE.InstancedMesh(voxelGeo, shipMaterial, voxelsData.length);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        voxelsData.forEach((vd, index) => {
            dummy.position.copy(vd.pos);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(index, dummy.matrix);
            instancedMesh.setColorAt(index, vd.color);
        });

        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        shipGroup.userData.instancedMesh = instancedMesh;
        shipGroup.add(instancedMesh);

        // --- Cannon Turrets ---
        const turretCount = ship.size <= 2 ? 1 : ship.size <= 4 ? 2 : 3;
        const turretBaseMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 });

        const shipLen = ship.size;

        for (let i = 0; i < turretCount; i++) {
            const turretGroup = new THREE.Group();

            // Distribute turrets evenly along the ship length
            // Using (i + 1) / (turretCount + 1) ensures perfect spacing
            const tPos = ((i + 1) / (turretCount + 1)) * shipLen - 0.5;

            const baseGeo = new THREE.BoxGeometry(0.15, 0.08, 0.15);
            const baseMesh = new THREE.Mesh(baseGeo, turretBaseMat);
            baseMesh.castShadow = true;
            turretGroup.add(baseMesh);

            const barrelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6);
            const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
            barrelMesh.castShadow = true;

            if (orientation === Orientation.Horizontal) {
                barrelMesh.rotation.z = Math.PI / 2;
                barrelMesh.position.x = 0.12;
                turretGroup.position.set(tPos, 0.2, 0);
            } else {
                barrelMesh.rotation.x = Math.PI / 2;
                barrelMesh.position.z = 0.12;
                turretGroup.position.set(0, 0.2, tPos);
            }
            barrelMesh.position.y = 0.02;
            turretGroup.add(barrelMesh);

            shipGroup.add(turretGroup);
        }

        targetGroup.add(shipGroup);

        // Initial Ripple in center
        const cx = orientation === Orientation.Horizontal ? x + Math.floor(ship.size / 2) : x;
        const cz = orientation === Orientation.Vertical ? z + Math.floor(ship.size / 2) : z;
        const rippleWorldX = cx - boardOffset + 0.5;
        const rippleWorldZ = cz - boardOffset + 0.5;
        this.addRipple(rippleWorldX, rippleWorldZ, isPlayer);
    }

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean = false) {
        // If the player fired the shot, it lands on the enemy board. If the enemy fired, it lands on the player board.
        const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

        // Ensure projectile looks the same in flight and when stuck
        // So we just use the final state color for the entire flight path.
        // It sticks to the voxel approach and doesn't get a magic color swap.
        let finalColor = 0xcccccc; // Miss -> greyish white
        if (result === 'hit' || result === 'sunk') {
            finalColor = 0xff0000; // Hit -> red
        }

        const activeMat = new THREE.MeshStandardMaterial({ color: finalColor, roughness: 0.5 });
        // Make the marker glow slightly while flying, then we'll remove emission on hit
        const activeGlowColor = result === 'hit' || result === 'sunk' ? 0x880000 : 0x444444;
        activeMat.emissive.setHex(activeGlowColor);

        const marker = new THREE.Group();
        marker.userData = { originalMat: activeMat, isAttackMarker: true };

        // Create a inner group to handle the 25-degree pitch down offset
        const rocketModel = new THREE.Group();
        rocketModel.rotation.x = 25 * Math.PI / 180; // Pitch down 25 degrees
        marker.add(rocketModel);

        // Voxel Missile
        const voxelSize = 0.05;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        // Define voxel positions for a small missile shape pointing +z
        const voxels: THREE.Vector3[] = [];

        // Body (3x3 grid, 8 blocks long)
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                // Remove corners for rounded shape
                if (Math.abs(x) === 1 && Math.abs(y) === 1) continue;

                for (let z = 0; z < 8; z++) {
                    voxels.push(new THREE.Vector3(x * voxelSize, y * voxelSize, z * voxelSize));
                }
            }
        }

        // Nose (tapered)
        voxels.push(new THREE.Vector3(0, voxelSize, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, -voxelSize, 8 * voxelSize));
        voxels.push(new THREE.Vector3(voxelSize, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(-voxelSize, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, 0, 9 * voxelSize)); // Tip

        // Fins
        for (let z = 0; z < 3; z++) {
            voxels.push(new THREE.Vector3(2 * voxelSize, 0, z * voxelSize));
            voxels.push(new THREE.Vector3(-2 * voxelSize, 0, z * voxelSize));
            voxels.push(new THREE.Vector3(0, 2 * voxelSize, z * voxelSize));
            voxels.push(new THREE.Vector3(0, -2 * voxelSize, z * voxelSize));
        }

        const instancedMissile = new THREE.InstancedMesh(voxelGeo, activeMat, voxels.length);
        instancedMissile.castShadow = true;

        const dummy = new THREE.Object3D();
        voxels.forEach((pos, i) => {
            dummy.position.copy(pos);
            dummy.updateMatrix();
            instancedMissile.setMatrixAt(i, dummy.matrix);
        });

        rocketModel.add(instancedMissile);
        marker.userData.instancedMesh = instancedMissile;

        const boardOffset = Config.board.width / 2;
        const worldX = x - boardOffset + 0.5;
        const worldZ = z - boardOffset + 0.5;

        const targetLocalPos = new THREE.Vector3(worldX, 0.4, worldZ);

        // Instant placement for replay — skip arc animation entirely
        if (isReplay) {
            if (marker.userData.instancedMesh) {
                const im = marker.userData.instancedMesh as THREE.InstancedMesh;
                const finalMat = marker.userData.originalMat.clone();
                finalMat.emissive.setHex(0x000000); // kill the glow
                im.material = finalMat;

                // Also apply partial destruction visually so replays don't look brand new
                const destroyRatio = result === 'hit' || result === 'sunk' ? 0.60 : 0.30;
                const dummy = new THREE.Object3D();
                for (let j = 0; j < im.count; j++) {
                    if (Math.random() < destroyRatio) {
                        im.getMatrixAt(j, dummy.matrix);
                        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                        dummy.scale.set(0, 0, 0);
                        dummy.updateMatrix();
                        im.setMatrixAt(j, dummy.matrix);
                    }
                }
                im.instanceMatrix.needsUpdate = true;
            }
            marker.position.set(worldX, 0.4, worldZ);
            // Clear fog for replayed player attacks
            if (isPlayer) {
                this.clearFogCell(x, z);
            }
            targetGroup.add(marker);
            return;
        }

        // Find a random friendly ship block to start from
        const sourceGroup = isPlayer ? this.playerBoardGroup : this.enemyBoardGroup;
        let startPos = new THREE.Vector3((Math.random() - 0.5) * 10, 5, (Math.random() - 0.5) * 10);

        const friendlyShips: THREE.Group[] = [];
        sourceGroup.children.forEach(c => {
            if (c.userData.isShip && c.visible && !c.userData.isSinking) friendlyShips.push(c as THREE.Group);
        });

        if (friendlyShips.length > 0) {
            const randomShip = friendlyShips[Math.floor(Math.random() * friendlyShips.length)];
            randomShip.getWorldPosition(startPos);
            targetGroup.worldToLocal(startPos); // Convert to targetGroup's local space
        } else {
            // Fallback if no ships visible
            startPos.set(0, 10, 0);
        }

        // Control point for parabolic arc
        const midPoint = new THREE.Vector3().addVectors(startPos, targetLocalPos).multiplyScalar(0.5);
        midPoint.y += 5.0; // Arch up by 5 units

        const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, targetLocalPos);

        marker.position.copy(startPos);
        targetGroup.add(marker);

        // Note: ripple and turbulence now triggered on impact (in update loop), not here

        this.fallingMarkers.push({
            mesh: marker,
            curve: curve,
            progress: 0,
            worldX,
            worldZ,
            result,
            isPlayer,
            cellX: x,
            cellZ: z
        });
    }
}
