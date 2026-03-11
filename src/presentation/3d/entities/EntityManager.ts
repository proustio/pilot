import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { WaterShader } from '../materials/WaterShader';
import { ParticleSystem } from './ParticleSystem';
import { Config } from '../../../infrastructure/config/Config';

export class EntityManager {
    private scene: THREE.Scene;

    public masterBoardGroup: THREE.Group;
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    private targetRotationX: number = 0;
    private fogMeshes: (THREE.Mesh | null)[] = new Array(100).fill(null);
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
        const boardSize = 10;
        const offset = boardSize / 2;

        const createWaterUniforms = () => ({
            time: { value: 0 },
            baseColor: { value: new THREE.Color(0x1565C0) },
            peakColor: { value: new THREE.Color(0x87CEFA) },
            opacity: { value: 0.85 },
            globalTurbulence: { value: 0.0 },
            rippleCenters: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
            rippleTimes: { value: [0.0, 0.0, 0.0, 0.0, 0.0] }
        });

        // Create the "Master Wood Frame" (hollow inside)
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });

        const borders = [
            { x: 11, z: 0.5, posZ: -5.25, posX: 0 },  // Top
            { x: 11, z: 0.5, posZ: 5.25, posX: 0 },   // Bottom
            { x: 0.5, z: 10, posZ: 0, posX: -5.25 },   // Left
            { x: 0.5, z: 10, posZ: 0, posX: 5.25 }     // Right
        ];

        borders.forEach(b => {
            const borderGeo = new THREE.BoxGeometry(b.x, 2.4, b.z);
            const borderMesh = new THREE.Mesh(borderGeo, woodMat);
            borderMesh.position.set(b.posX, 0, b.posZ);
            borderMesh.castShadow = true;
            borderMesh.receiveShadow = true;
            this.masterBoardGroup.add(borderMesh);
        });

        // Sand-coloured bottom plane separating the two sides
        const sandGeo = new THREE.PlaneGeometry(10, 10);
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xD2B48C, roughness: 1.0, side: THREE.DoubleSide });
        const sandPlane = new THREE.Mesh(sandGeo, sandMat);
        sandPlane.rotation.x = -Math.PI / 2;
        sandPlane.position.y = 0;
        sandPlane.receiveShadow = true;
        this.masterBoardGroup.add(sandPlane);

        // Create water panes for the boards
        const boardWaterGeo = new THREE.PlaneGeometry(10, 10, 32, 32);

        this.playerWaterUniforms = createWaterUniforms();
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

        this.enemyWaterUniforms = createWaterUniforms();
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
        const fogMat = new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.85 });
        const fogGeometry = new THREE.BoxGeometry(0.9, 0.4, 0.9);

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

                // Fog block on enemy side
                const fogMesh = new THREE.Mesh(fogGeometry, fogMat);
                fogMesh.position.set(worldX, 0.25, worldZ);
                this.enemyBoardGroup.add(fogMesh);
                this.fogMeshes[z * boardSize + x] = fogMesh;
            }
        }

        // GridHelpers for visual debug
        const pGrid = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
        pGrid.position.y = 0.05;
        pGrid.material.transparent = true; pGrid.material.opacity = 0.5;
        this.playerBoardGroup.add(pGrid);

        const eGrid = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
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

    public update() {
        // Smoothly lerp board rotation
        const actualFlipSpeed = Config.timing.boardFlipSpeed * Config.timing.gameSpeedMultiplier;
        this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * actualFlipSpeed;

        // Update water shader time and ripples
        const waterTimeIncrement = 0.016 * Config.timing.gameSpeedMultiplier;
        this.time += waterTimeIncrement;

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

                // Apply original material
                if (m.mesh.userData.meshes) {
                    m.mesh.userData.meshes.forEach((mesh: THREE.Mesh) => {
                        mesh.material = m.mesh.userData.originalMat;
                    });
                }

                const targetGroup = m.isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

                // Always spawn water splash on impact (hit or miss)
                this.particleSystem.spawnSplash(m.worldX, 0.2, m.worldZ, targetGroup);

                // Reveal Fog
                if (m.isPlayer) {
                    const fogIdx = m.cellZ * 10 + m.cellX;
                    const fogMesh = this.fogMeshes[fogIdx];
                    if (fogMesh) {
                        this.enemyBoardGroup.remove(fogMesh);
                        this.fogMeshes[fogIdx] = null;
                        // Trigger ripple nearby to show impact through the clearing fog
                        this.addRipple(m.worldX, m.worldZ, false);
                    }
                }

                if (m.result === 'hit' || m.result === 'sunk') {
                    // Explode projectile: Hide nose, squish and darken body
                    if (m.mesh.userData.meshes) {
                        m.mesh.userData.meshes[1].visible = false; // hide nose
                        m.mesh.userData.meshes[0].scale.y = 0.5; // squish body
                        m.mesh.userData.meshes[0].position.y = 0.1;

                        const burntMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
                        m.mesh.userData.meshes[0].material = burntMat;
                    }

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
        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach(child => {
                if (child.userData.isShip && child.userData.isSinking) {
                    if (child.position.y > -1.0) { // Sink until near sand bottom
                        child.position.y -= descentRate;
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
            coversCell: (tx: number, tz: number) => {
                if (orientation === Orientation.Horizontal) {
                    return tz === z && tx >= x && tx < x + ship.size;
                } else {
                    return tx === x && tz >= z && tz < z + ship.size;
                }
            }
        };

        // Position ship group at the ship's origin cell
        const originWorldX = x - 5 + 0.5;
        const originWorldZ = z - 5 + 0.5;
        shipGroup.position.set(originWorldX, 0, originWorldZ);
        shipGroup.visible = isPlayer; // Hide enemy ships initially

        const shipMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.7,
        });

        // Build the ship from tiny voxels using InstancedMesh
        const voxelSize = 0.1;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        // Calculate bounding box of the ship in local space (each cell is 1.0 unit)
        const length = orientation === Orientation.Horizontal ? ship.size : 1;
        const width = orientation === Orientation.Vertical ? ship.size : 1;

        const voxelsLocs: THREE.Vector3[] = [];

        const L = ship.size * 10;
        const centerX = L / 2 - 0.5;

        for (let lx = 0; lx < length * 10; lx++) {
            for (let lz = 0; lz < width * 10; lz++) {
                const shipLengthPos = orientation === Orientation.Horizontal ? lx : lz;
                const shipWidthPos = orientation === Orientation.Horizontal ? lz : lx;

                const xNorm = (shipLengthPos - centerX) / (L / 2);
                const widthAtX = 4.0 * Math.cos(xNorm * Math.PI / 2);
                const minW = 4.5 - widthAtX;
                const maxW = 4.5 + widthAtX;

                if (shipWidthPos >= Math.floor(minW) && shipWidthPos <= Math.ceil(maxW)) {
                    // Edge if it's near to the min/max width, or near the bow/stern
                    const isEdge = shipWidthPos - minW < 1.0 || maxW - shipWidthPos < 1.0 || Math.abs(xNorm) > 0.85;

                    const yOffset = Math.pow(Math.abs(xNorm), 3) * 2; // Bow/stern rise up
                    const maxLy = isEdge ? 2 + yOffset : 1; // Walls are higher, floor is 1

                    for (let ly = 1; ly <= maxLy; ly++) {
                        voxelsLocs.push(new THREE.Vector3(
                            lx * voxelSize - (voxelSize / 2 * 9),
                            ly * voxelSize,
                            lz * voxelSize - (voxelSize / 2 * 9)
                        ));
                    }
                }
            }
        }

        const instancedMesh = new THREE.InstancedMesh(voxelGeo, shipMaterial, voxelsLocs.length);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        voxelsLocs.forEach((pos, index) => {
            dummy.position.copy(pos);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(index, dummy.matrix);
        });

        shipGroup.userData.instancedMesh = instancedMesh;
        shipGroup.add(instancedMesh);
        targetGroup.add(shipGroup);

        // Initial Ripple in center
        const cx = orientation === Orientation.Horizontal ? x + Math.floor(ship.size / 2) : x;
        const cz = orientation === Orientation.Vertical ? z + Math.floor(ship.size / 2) : z;
        const rippleWorldX = cx - 5 + 0.5;
        const rippleWorldZ = cz - 5 + 0.5;
        this.addRipple(rippleWorldX, rippleWorldZ, isPlayer);
    }

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean) {
        // If the player fired the shot, it lands on the enemy board. If the enemy fired, it lands on the player board.
        const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

        // Revert previous last attack marker to its original color is no longer needed 
        // since we permanently apply the material at the end of the arc.

        let originalColor = 0xcccccc; // Miss -> greyish white
        if (result === 'hit' || result === 'sunk') {
            originalColor = 0xff0000; // Hit -> red
        }

        const originalMat = new THREE.MeshStandardMaterial({ color: originalColor, roughness: 0.5 });
        // Active yellow material
        const activeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.2, emissive: 0x888800 });

        const marker = new THREE.Group();
        marker.userData = { originalMat, isAttackMarker: true };

        // Create a inner group to handle the 25-degree pitch down offset
        const rocketModel = new THREE.Group();
        rocketModel.rotation.x = 25 * Math.PI / 180; // Pitch down 25 degrees
        marker.add(rocketModel);

        // Bullet / Rocket Body
        const bodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8);
        const bodyMesh = new THREE.Mesh(bodyGeo, activeMat);
        bodyMesh.rotation.x = Math.PI / 2; // Face +z in local space
        bodyMesh.position.z = 0.2;
        bodyMesh.castShadow = true;
        rocketModel.add(bodyMesh);

        // Bullet / Rocket Nose
        const noseGeo = new THREE.ConeGeometry(0.12, 0.25, 8);
        const noseMesh = new THREE.Mesh(noseGeo, activeMat);
        noseMesh.rotation.x = Math.PI / 2; // Face +z
        noseMesh.position.z = 0.525; // nose leads
        noseMesh.castShadow = true;
        rocketModel.add(noseMesh);

        // Add fins
        const finGeo = new THREE.BoxGeometry(0.05, 0.2, 0.3);
        const finMesh1 = new THREE.Mesh(finGeo, activeMat);
        finMesh1.position.z = 0.1;
        finMesh1.rotation.z = Math.PI / 4; // Slanted fins
        rocketModel.add(finMesh1);
        const finMesh2 = new THREE.Mesh(finGeo, activeMat);
        finMesh2.position.z = 0.1;
        finMesh2.rotation.y = Math.PI / 2;
        finMesh2.rotation.x = Math.PI / 2;
        rocketModel.add(finMesh2);

        marker.userData.meshes = [bodyMesh, noseMesh, finMesh1, finMesh2];

        const worldX = x - 5 + 0.5;
        const worldZ = z - 5 + 0.5;

        const targetLocalPos = new THREE.Vector3(worldX, 0.4, worldZ);

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

        // Trigger water ripple
        this.addRipple(worldX, worldZ, !isPlayer); // If player fired, it lands on enemy board

        if (result === 'sunk') {
            const targetUniforms = isPlayer ? this.enemyWaterUniforms : this.playerWaterUniforms;
            if (targetUniforms) {
                targetUniforms.globalTurbulence.value = 0.4;
            }
        }

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
