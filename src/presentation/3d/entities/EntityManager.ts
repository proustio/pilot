import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { WaterShader } from '../materials/WaterShader';
import { ParticleSystem } from './ParticleSystem';
import { Config } from '../../../infrastructure/config/Config';
import { getIndex } from '../../../domain/board/BoardUtils';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';

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
    private fogMeshes: (THREE.Mesh | null)[] = new Array(Config.board.width * Config.board.height).fill(null);
    private fallingMarkers: { mesh: THREE.Object3D, curve: THREE.QuadraticBezierCurve3, progress: number, worldX: number, worldZ: number, result: string, isPlayer: boolean, cellX: number, cellZ: number, isReplayFlag: boolean }[] = [];
    private wasBusy: boolean = false;


    private time: number = 0;
    private playerWaterUniforms: any = null;
    private enemyWaterUniforms: any = null;

    private playerRippleIndex: number = 0;
    private enemyRippleIndex: number = 0;

    private particleSystem: ParticleSystem;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.masterBoardGroup = new THREE.Group();
        this.staticGroup = new THREE.Group();
        this.playerBoardGroup = new THREE.Group();
        this.enemyBoardGroup = new THREE.Group();

        this.particleSystem = new ParticleSystem();

        // Position faces: Player points UP, Enemy points DOWN
        this.playerBoardGroup.position.y = 0.6;

        this.enemyBoardGroup.position.y = -0.6;
        this.enemyBoardGroup.rotation.x = Math.PI; // Flipped upside down

        this.masterBoardGroup.add(this.playerBoardGroup);
        this.masterBoardGroup.add(this.enemyBoardGroup);
        
        this.scene.add(this.masterBoardGroup);
        this.scene.add(this.staticGroup);

        this.createBoardMeshes();

        // Removed disconnected SET_FLIP_SPEED listener
    }

    private createBoardMeshes() {
        this.playerGridTiles = [];
        this.enemyGridTiles = [];

        const boardSize = Config.board.width;
        const offset = boardSize / 2;

        const createWaterUniforms = (isEnemy: boolean) => ({
            time: { value: 0 },
            baseColor: { value: isEnemy ? new THREE.Color(0x8B0000) : new THREE.Color(0x000080) }, // Dark Red vs Dark Navy
            peakColor: { value: isEnemy ? new THREE.Color(0xDC143C) : new THREE.Color(0x4169E1) }, // Crimson vs Royal Blue
            opacity: { value: 0.85 },
            globalTurbulence: { value: 0.0 },
            rippleCenters: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
            rippleTimes: { value: [0.0, 0.0, 0.0, 0.0, 0.0] }
        });

        // Create Retro Industrial Texture (Procedural)
        const createIndustrialTexture = () => {
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            
            // Base metal color
            ctx.fillStyle = '#050515';
            ctx.fillRect(0, 0, size, size);
            
            // Technical grid lines
            ctx.strokeStyle = 'rgba(65, 105, 225, 0.15)';
            ctx.lineWidth = 1;
            for(let i=0; i<size; i+=16) {
                ctx.beginPath();
                ctx.moveTo(i, 0); ctx.lineTo(i, size);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i); ctx.lineTo(size, i);
                ctx.stroke();
            }

            // Technical "specs" or noise
            for(let i=0; i<500; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const s = Math.random() * 1.5;
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)';
                ctx.fillRect(x, y, s, s);
            }

            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(4, 1);
            return tex;
        };

        const industrialTex = createIndustrialTexture();

        // Create the "Master Metal Frame" (hollow inside)
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x222233, 
            map: industrialTex,
            metalness: 0.9,
            roughness: 0.2,
            emissive: 0x000022,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        const borderOffset = offset + 0.15;
        const borderLength = boardSize + 0.3; 
        
        // Much thinner and sleeker frame
        const borders = [
            { x: borderLength, y: 0.15, z: 0.15, posZ: -borderOffset, posX: 0 },  // Top
            { x: borderLength, y: 0.15, z: 0.15, posZ: borderOffset, posX: 0 },   // Bottom
            { x: 0.15, y: 0.15, z: borderLength, posZ: 0, posX: -borderOffset },   // Left
            { x: 0.15, y: 0.15, z: borderLength, posZ: 0, posX: borderOffset }     // Right
        ];

        borders.forEach(b => {
            const borderGeo = new THREE.BoxGeometry(b.x, b.y, b.z);
            const borderMesh = new THREE.Mesh(borderGeo, frameMat);
            borderMesh.position.set(b.posX, 0, b.posZ);
            borderMesh.castShadow = true;
            borderMesh.receiveShadow = true;
            this.masterBoardGroup.add(borderMesh);
        });

        // Add a "Tactical Base" block (stays static at bottom)
        const baseGeo = new THREE.BoxGeometry(boardSize + 2, 0.4, boardSize + 2);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x050510,
            metalness: 0.9,
            roughness: 0.4,
            transparent: true,
            opacity: 0.8
        });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.y = -1.2;
        this.staticGroup.add(baseMesh);

        // Add corner "bracket" supports (also static)
        const bracketGeo = new THREE.BoxGeometry(0.8, 2.4, 0.8);
        const bracketPos = borderOffset + 0.2;
        const cornerPositions = [
            { x: bracketPos, z: bracketPos },
            { x: -bracketPos, z: bracketPos },
            { x: bracketPos, z: -bracketPos },
            { x: -bracketPos, z: -bracketPos }
        ];

        cornerPositions.forEach(pos => {
            const bracket = new THREE.Mesh(bracketGeo, frameMat);
            bracket.position.set(pos.x, -1.0, pos.z);
            this.staticGroup.add(bracket);
            
            // Add a small glowing status LED on each corner bracket
            const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
            const ledMat = new THREE.MeshBasicMaterial({ color: 0x4169E1, transparent: true }); 
            const led = new THREE.Mesh(ledGeo, ledMat);
            led.position.set(pos.x * 1.1, 0.2, pos.z * 1.1);
            led.userData = { isStatusLED: true, phase: Math.random() * Math.PI };
            this.staticGroup.add(led);
        });

        // Industrial Rivets along the frame
        const rivetGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6);
        const rivetMat = new THREE.MeshStandardMaterial({ color: 0x444455, metalness: 0.8, roughness: 0.2 });
        
        const spawnRivets = (count: number, start: THREE.Vector3, end: THREE.Vector3) => {
            for(let i=0; i<count; i++) {
                const rivet = new THREE.Mesh(rivetGeo, rivetMat);
                const t = i / (count - 1);
                rivet.position.lerpVectors(start, end, t);
                this.masterBoardGroup.add(rivet);
            }
        };

        const rD = borderOffset;
        const rH = 0.08;
        spawnRivets(8, new THREE.Vector3(-offset, rH, rD), new THREE.Vector3(offset, rH, rD));
        spawnRivets(8, new THREE.Vector3(-offset, rH, -rD), new THREE.Vector3(offset, rH, -rD));
        spawnRivets(8, new THREE.Vector3(rD, rH, -offset), new THREE.Vector3(rD, rH, offset));
        spawnRivets(8, new THREE.Vector3(-rD, rH, -offset), new THREE.Vector3(-rD, rH, offset));

        // Add Retro 3D Screws to the frame corners
        const screwGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8);
        const screwMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.9,
            roughness: 0.1
        });
        const screwSlotGeo = new THREE.BoxGeometry(0.18, 0.02, 0.02);
        const screwSlotMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        const screwPositions = [
            { x: borderOffset + 0.25, z: borderOffset + 0.25 },
            { x: -(borderOffset + 0.25), z: borderOffset + 0.25 },
            { x: borderOffset + 0.25, z: -(borderOffset + 0.25) },
            { x: -(borderOffset + 0.25), z: -(borderOffset + 0.25) }
        ];

        // Screws moved to corner brackets for better look
        screwPositions.forEach(pos => {
            const screwGroup = new THREE.Group();
            const screwHead = new THREE.Mesh(screwGeo, screwMat);
            const screwSlot = new THREE.Mesh(screwSlotGeo, screwSlotMat);
            screwHead.rotation.x = Math.PI / 2;
            screwSlot.rotation.x = Math.PI / 2;
            screwSlot.position.y = 0.04;
            screwGroup.add(screwHead);
            screwGroup.add(screwSlot);

            const topScrew = screwGroup.clone();
            topScrew.position.set(pos.x, 0.2, pos.z);
            this.staticGroup.add(topScrew);
        });

        // Bottom plane separating the two sides
        const bottomGeo = new THREE.PlaneGeometry(boardSize, boardSize);
        const bottomMat = new THREE.MeshStandardMaterial({
            color: 0x111111, // Near Black
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

        this.playerWaterUniforms = createWaterUniforms(false); // Player water (green)
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

        this.enemyWaterUniforms = createWaterUniforms(true); // Enemy water (red)
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

        // Create interactable grid tiles (glowy sci-fi blocks)
        const tileGeometry = new THREE.BoxGeometry(0.95, 0.1, 0.95);
        const tilePlayerMat = new THREE.MeshStandardMaterial({ color: 0x000080, emissive: 0x228B22, emissiveIntensity: 0.2, transparent: true, opacity: 0.1, depthWrite: false }); // Forest green glow
        const tileEnemyMat = new THREE.MeshStandardMaterial({ color: 0x8B0000, emissive: 0xDC143C, emissiveIntensity: 0.2, transparent: true, opacity: 0.1, depthWrite: false }); // Crimson glow

        // Animated Voxel Fog (Holographic blocks)
        const fogVoxelGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const fogMat = new THREE.MeshStandardMaterial({
            color: 0x000080, // Navy blue core
            emissive: 0x4169E1, // Royal blue glow
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.6,
            roughness: 0.2,
            metalness: 0.8
        });

        for (let z = 0; z < boardSize; z++) {
            for (let x = 0; x < boardSize; x++) {
                const worldX = x - offset + 0.5;
                const worldZ = z - offset + 0.5;

                // Player Side tile
                const ptile = new THREE.Mesh(tileGeometry, tilePlayerMat);
                ptile.position.set(worldX, 0, worldZ);
                ptile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: true };
                this.playerBoardGroup.add(ptile);
                this.playerGridTiles.push(ptile);

                // Enemy Side tile
                const etile = new THREE.Mesh(tileGeometry, tileEnemyMat);
                etile.position.set(worldX, 0, worldZ);
                etile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: false };
                this.enemyBoardGroup.add(etile);
                this.enemyGridTiles.push(etile);

                // Voxel Fog cloud per cell - increased voxel count for density
                const numVoxels = 100;
                const fogCloud = new THREE.InstancedMesh(fogVoxelGeo, fogMat, numVoxels);
                fogCloud.position.set(worldX, 0.3, worldZ);

                const dummy = new THREE.Object3D();
                const voxelData = [];
                for (let i = 0; i < numVoxels; i++) {
                    // Spread a bit wider and taller to completely obscure cell
                    const vx = (Math.random() - 0.5) * 0.95;
                    const vy = (Math.random() - 0.5) * 0.8;
                    const vz = (Math.random() - 0.5) * 0.95;
                    dummy.position.set(vx, vy, vz);
                    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    dummy.scale.setScalar(1.0 + Math.random() * 0.8);
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

        // Holographic Grid Lines
        const pGrid = new THREE.GridHelper(boardSize, boardSize, 0x4169E1, 0x228B22); // Royal Blue / Forest Green
        pGrid.position.y = 0.05;
        pGrid.material.transparent = true; pGrid.material.opacity = 0.4;
        this.playerBoardGroup.add(pGrid);

        const eGrid = new THREE.GridHelper(boardSize, boardSize, 0xDC143C, 0xFF2400); // Crimson / Scarlet
        eGrid.position.y = 0.05;
        eGrid.material.transparent = true; eGrid.material.opacity = 0.4;
        this.enemyBoardGroup.add(eGrid);
    }

    /**
     * Returns the list of objects that the Raycaster should test against.
     * Only returns the tiles that are currently facing UP.
     */
    public getInteractableObjects(): readonly THREE.Object3D[] {
        // Determine which side is facing up by looking at rotation
        // Math.PI rotation means enemy board is UP
        const isEnemyUp = Math.abs(this.masterBoardGroup.rotation.x - Math.PI) < 0.1;
        if (isEnemyUp) {
            return this.enemyGridTiles;
        }
        return this.playerGridTiles;
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

    /**
     * Returns true if there are any active animations (projectiles, particles, sinking ships).
     */
    public isBusy(): boolean {
        if (this.fallingMarkers.length > 0) return true;
        if (this.particleSystem.hasActiveParticles()) return true;
        if (this.isTransitioning) return true; // Block if camera is moving

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

        this.staticGroup.children.forEach(child => {
            if (child.userData.isStatusLED) {
                const led = child as THREE.Mesh;
                const mat = led.material as THREE.MeshBasicMaterial;
                child.userData.phase += 0.05;
                const glow = 0.5 + Math.sin(child.userData.phase) * 0.5;
                mat.opacity = 0.3 + glow * 0.7;
            }
        });

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

                if (m.isPlayer) {
                    const fogIdx = getIndex(m.cellX, m.cellZ, Config.board.width);
                    const fogMesh = this.fogMeshes[fogIdx];
                    if (fogMesh) {
                        this.enemyBoardGroup.remove(fogMesh);
                        this.fogMeshes[fogIdx] = null;
                    }
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

                this.fallingMarkers.splice(i, 1);
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
        const targetGroup = isPlayer ? this.playerBoardGroup : this.enemyBoardGroup;

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

        const boardOffset = Config.board.width / 2;
        const originWorldX = x - boardOffset + 0.5;
        const originWorldZ = z - boardOffset + 0.5;
        shipGroup.position.set(originWorldX, 0, originWorldZ);
        shipGroup.visible = isPlayer;

        // Base dark metal colors
        const hullColor = new THREE.Color(0x111111); // Black/Dark Grey
        const deckColor = new THREE.Color(0x222222);
        const bridgeColor = new THREE.Color(0x1a1a1a);
        const darkAccent = new THREE.Color(0x050505);

        // Neon Accents (Glow colors assigned to edges/accents)
        const accentColor = isPlayer ? new THREE.Color(0xFFD700) : new THREE.Color(0xFF2400); // Gold vs Scarlet

        const voxelSize = 0.1;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        const length = orientation === Orientation.Horizontal ? ship.size : 1;
        const width = orientation === Orientation.Vertical ? ship.size : 1;

        const voxelsData: { pos: THREE.Vector3, color: THREE.Color }[] = [];

        const L = ship.size * 10;
        const centerX = L / 2 - 0.5;

        const isCarrier = ship.size === 5;
        const isBattleship = ship.size === 4;
        const isDestroyer = ship.size === 3;

        const getHullWidth = (xNorm: number): number => {
            const absX = Math.abs(xNorm);
            if (isCarrier) {
                if (absX > 0.8) return 2.0 + 3.0 * (1.0 - (absX - 0.8) / 0.2);
                return 5.0;
            } else if (isBattleship) {
                if (absX > 0.7) return 1.5 + 2.5 * (1.0 - (absX - 0.7) / 0.3);
                return 4.0;
            } else if (isDestroyer) {
                if (absX > 0.6) return 1.0 + 2.0 * (1.0 - (absX - 0.6) / 0.4);
                return 3.0;
            } else {
                if (absX > 0.5) return 1.0 + 1.0 * (1.0 - (absX - 0.5) / 0.5);
                return 2.0;
            }
        };

        const getBridgeHeight = (xNorm: number, isEdge: boolean, shipWidthPos: number, maxW: number): number => {
            const absX = Math.abs(xNorm);
            if (isCarrier) {
                const isIslandSide = (maxW - shipWidthPos) <= 2.0;
                if (absX < 0.2 && isIslandSide && !isEdge) return 4;
                return 1;
            } else if (isBattleship) {
                if (absX < 0.15 && !isEdge) return 5;
                if (absX < 0.3 && !isEdge) return 3;
                return 1;
            } else if (isDestroyer) {
                if (xNorm > -0.2 && xNorm < 0.1 && !isEdge) return 3;
                return 1;
            } else {
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

                    if (isEdge || isBowStern) {
                        const bowRise = isCarrier ? 0 : Math.pow(Math.max(0, Math.abs(xNorm) - 0.7) / 0.3, 2) * 2;
                        maxLy = Math.max(maxLy, 2 + bowRise);
                    }

                    for (let ly = 1; ly <= maxLy; ly++) {
                        let color = hullColor;
                        if (ly === maxLy && !isEdge) {
                            color = deckColor;
                            if (isCarrier && !isEdge && shipWidthPos === Math.floor(center)) {
                                color = darkAccent;
                            }
                        } else if (isEdge && ly > 1) {
                            color = accentColor;
                        } else if (ly > 2 && !isEdge) {
                            color = bridgeColor;
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
            roughness: 0.2,
            metalness: 0.8
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

        // Add Emissive/Glow Effect if Color matches Neon Accent
        // Using instanced mesh per-instance emissive coloring isn't natively supported easily,
        // so we fake it by setting the global material emissive map or just relying on intense directional lighting.
        // Instead, we create a wireframe outline overlay to enforce the "neon border" jarvis vibe.

        const instancedLines = new THREE.InstancedMesh(
            new THREE.BoxGeometry(voxelSize*1.01, voxelSize*1.01, voxelSize*1.01), // slightly larger box for line substitute
            new THREE.MeshBasicMaterial({
                color: isPlayer ? 0xFFD700 : 0xFF2400,
                wireframe: true,
                transparent: true,
                opacity: 0.2
            }),
            voxelsData.length
        );

        voxelsData.forEach((vd, index) => {
            dummy.scale.setScalar(1);
            dummy.position.copy(vd.pos);
            dummy.updateMatrix();
            instancedLines.setMatrixAt(index, dummy.matrix);
            // Only show glow on the edges/accents
            if (vd.color.equals(accentColor)) {
               instancedLines.setColorAt(index, new THREE.Color(isPlayer ? 0xFFD700 : 0xFF2400));
            } else {
               instancedLines.setColorAt(index, new THREE.Color(0x000000));
               // hide the others by zeroing scale
               dummy.scale.set(0,0,0);
               dummy.updateMatrix();
               instancedLines.setMatrixAt(index, dummy.matrix);
            }
        });

        instancedLines.instanceMatrix.needsUpdate = true;
        if (instancedLines.instanceColor) instancedLines.instanceColor.needsUpdate = true;

        shipGroup.add(instancedLines);

        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        shipGroup.userData.instancedMesh = instancedMesh;
        shipGroup.add(instancedMesh);

        const turretCount = ship.size <= 2 ? 1 : ship.size <= 4 ? 2 : 3;
        const turretBaseMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 });

        const shipLen = ship.size;

        for (let i = 0; i < turretCount; i++) {
            const turretGroup = new THREE.Group();

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

        const cx = orientation === Orientation.Horizontal ? x + Math.floor(ship.size / 2) : x;
        const cz = orientation === Orientation.Vertical ? z + Math.floor(ship.size / 2) : z;
        const rippleWorldX = cx - boardOffset + 0.5;
        const rippleWorldZ = cz - boardOffset + 0.5;
        this.addRipple(rippleWorldX, rippleWorldZ, isPlayer);
    }

    public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean = false) {
        if (!isReplay) {
            AudioEngine.getInstance().playShoot();
        }

        const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

        // High-tech glowing projectile (Attack Marker)
        const activeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.2,
            metalness: 0.8,
            vertexColors: true
        });
        const activeGlowColor = result === 'hit' || result === 'sunk' ? 0xFF2400 : 0x4169E1; // Scarlet (hit) vs Royal Blue (miss)
        activeMat.emissive.setHex(activeGlowColor);
        activeMat.emissiveIntensity = 2.0; // intense glow

        const marker = new THREE.Group();
        marker.userData = { originalMat: activeMat, isAttackMarker: true };

        const rocketModel = new THREE.Group();
        rocketModel.rotation.x = 25 * Math.PI / 180;
        marker.add(rocketModel);

        const voxelSize = 0.05;
        const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

        const voxels: THREE.Vector3[] = [];

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                if (Math.abs(x) === 1 && Math.abs(y) === 1) continue;

                for (let z = 0; z < 8; z++) {
                    voxels.push(new THREE.Vector3(x * voxelSize, y * voxelSize, z * voxelSize));
                }
            }
        }

        voxels.push(new THREE.Vector3(0, voxelSize, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, -voxelSize, 8 * voxelSize));
        voxels.push(new THREE.Vector3(voxelSize, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(-voxelSize, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, 0, 8 * voxelSize));
        voxels.push(new THREE.Vector3(0, 0, 9 * voxelSize));

        for (let z = 0; z < 3; z++) {
            voxels.push(new THREE.Vector3(2 * voxelSize, 0, z * voxelSize));
            voxels.push(new THREE.Vector3(-2 * voxelSize, 0, z * voxelSize));
            voxels.push(new THREE.Vector3(0, 2 * voxelSize, z * voxelSize));
            voxels.push(new THREE.Vector3(0, -2 * voxelSize, z * voxelSize));
        }

        const instancedMissile = new THREE.InstancedMesh(voxelGeo, activeMat, voxels.length);
        instancedMissile.castShadow = true;

        const dummy = new THREE.Object3D();
        const white = new THREE.Color(0xffffff);
        const black = new THREE.Color(0x222222);

        voxels.forEach((pos, i) => {
            dummy.position.copy(pos);
            dummy.updateMatrix();
            instancedMissile.setMatrixAt(i, dummy.matrix);

            const zIndex = Math.round(pos.z / voxelSize);
            const isBlackStripe = zIndex % 2 === 0;
            instancedMissile.setColorAt(i, isBlackStripe ? black : white);
        });

        rocketModel.add(instancedMissile);
        marker.userData.instancedMesh = instancedMissile;

        const boardOffset = Config.board.width / 2;
        const worldX = x - boardOffset + 0.5;
        const worldZ = z - boardOffset + 0.5;

        const targetLocalPos = new THREE.Vector3(worldX, 0.4, worldZ);

        if (isReplay) {
            if (marker.userData.instancedMesh) {
                const im = marker.userData.instancedMesh as THREE.InstancedMesh;
                const finalMat = marker.userData.originalMat.clone();
                finalMat.emissive.setHex(0x000000);
                im.material = finalMat;

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
            if (isPlayer) {
                this.clearFogCell(x, z);
            }
            targetGroup.add(marker);

            // Restore visual effects (smoke, fire, sinks, voxel holes)
            if (result === 'hit' || result === 'sunk') {
                this.applyImpactEffects(x, z, result, isPlayer, true);
            }
            return;
        }

        const sourceGroup = isPlayer ? this.playerBoardGroup : this.enemyBoardGroup;
        let startPos = new THREE.Vector3((Math.random() - 0.5) * 10, 5, (Math.random() - 0.5) * 10);

        const friendlyShips: THREE.Group[] = [];
        sourceGroup.children.forEach((c: THREE.Object3D) => {
            if (c.userData.isShip && !c.userData.isSinking) friendlyShips.push(c as THREE.Group);
        });

        if (friendlyShips.length > 0) {
            const randomShip = friendlyShips[Math.floor(Math.random() * friendlyShips.length)];
            randomShip.getWorldPosition(startPos);
            targetGroup.worldToLocal(startPos);
        } else {
            startPos.set(0, 10, 0);
        }

        const midPoint = new THREE.Vector3().addVectors(startPos, targetLocalPos).multiplyScalar(0.5);
        midPoint.y += 5.0;

        const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, targetLocalPos);

        marker.position.copy(startPos);
        targetGroup.add(marker);

        this.fallingMarkers.push({
            mesh: marker,
            curve: curve,
            progress: 0,
            worldX,
            worldZ,
            result,
            isPlayer,
            cellX: x,
            cellZ: z,
            isReplayFlag: isReplay
        });
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
                                this.addRipple(ex, ez, !isPlayer);
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
