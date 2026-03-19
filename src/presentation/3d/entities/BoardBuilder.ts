import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { WaterShader } from '../materials/WaterShader';
import { EntityState } from './EntityState';

export class BoardBuilder {
    private state: EntityState;

    constructor(state: EntityState) {
        this.state = state;
    }

    public buildBoardMeshes() {
        this.state.playerGridTiles = [];
        this.state.enemyGridTiles = [];

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
            for (let i = 0; i < size; i += 16) {
                ctx.beginPath();
                ctx.moveTo(i, 0); ctx.lineTo(i, size);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i); ctx.lineTo(size, i);
                ctx.stroke();
            }

            // Technical "specs" or noise
            for (let i = 0; i < 500; i++) {
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
            this.state.masterBoardGroup.add(borderMesh);
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
        baseMesh.position.y = -2.4; // Lowered from -1.6 to -2.4 to match deeper board
        this.state.staticGroup.add(baseMesh);

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
            bracket.position.set(pos.x, -1.8, pos.z); // Lowered from -1.2 to -1.8
            this.state.staticGroup.add(bracket);

            // Add a small glowing status LED on each corner bracket
            const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
            const ledMat = new THREE.MeshBasicMaterial({ color: 0x4169E1, transparent: true });
            const led = new THREE.Mesh(ledGeo, ledMat);
            led.position.set(pos.x * 1.1, 0.2, pos.z * 1.1);
            led.userData = { isStatusLED: true, phase: Math.random() * Math.PI };
            this.state.staticGroup.add(led);
        });

        // Industrial Rivets along the frame
        const rivetGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6);
        const rivetMat = new THREE.MeshStandardMaterial({ color: 0x444455, metalness: 0.8, roughness: 0.2 });

        const spawnRivets = (count: number, start: THREE.Vector3, end: THREE.Vector3) => {
            for (let i = 0; i < count; i++) {
                const rivet = new THREE.Mesh(rivetGeo, rivetMat);
                const t = i / (count - 1);
                rivet.position.lerpVectors(start, end, t);
                this.state.masterBoardGroup.add(rivet);
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
            this.state.staticGroup.add(topScrew);
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
        this.state.masterBoardGroup.add(bottomPlane);

        // Create water panes for the boards
        const boardWaterGeo = new THREE.PlaneGeometry(boardSize, boardSize, 32, 32);

        this.state.playerWaterUniforms = createWaterUniforms(false); // Player water (green)
        const playerWaterMat = new THREE.ShaderMaterial({
            vertexShader: WaterShader.vertexShader,
            fragmentShader: WaterShader.fragmentShader,
            uniforms: this.state.playerWaterUniforms,
            transparent: true,
            side: THREE.FrontSide
        });
        const playerWaterPlane = new THREE.Mesh(boardWaterGeo, playerWaterMat);
        playerWaterPlane.rotation.x = -Math.PI / 2;
        playerWaterPlane.position.y = -0.25; // Slightly recessed from top
        playerWaterPlane.receiveShadow = true;
        this.state.playerBoardGroup.add(playerWaterPlane);

        this.state.enemyWaterUniforms = createWaterUniforms(true); // Enemy water (red)
        const enemyWaterMat = new THREE.ShaderMaterial({
            vertexShader: WaterShader.vertexShader,
            fragmentShader: WaterShader.fragmentShader,
            uniforms: this.state.enemyWaterUniforms,
            transparent: true,
            side: THREE.FrontSide
        });
        const enemyWaterPlane = new THREE.Mesh(boardWaterGeo, enemyWaterMat);
        enemyWaterPlane.rotation.x = -Math.PI / 2;
        enemyWaterPlane.position.y = -0.25; // Slightly recessed
        enemyWaterPlane.receiveShadow = true;
        this.state.enemyBoardGroup.add(enemyWaterPlane);

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
                this.state.playerBoardGroup.add(ptile);
                this.state.playerGridTiles.push(ptile);

                // Enemy Side tile
                const etile = new THREE.Mesh(tileGeometry, tileEnemyMat);
                etile.position.set(worldX, 0, worldZ);
                etile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: false };
                this.state.enemyBoardGroup.add(etile);
                this.state.enemyGridTiles.push(etile);

                // Voxel Fog cloud per cell - increased voxel count for density
                const numVoxels = 100;
                const fogCloud = new THREE.InstancedMesh(fogVoxelGeo, fogMat, numVoxels);
                fogCloud.position.set(worldX, 0.2, worldZ); // Lowered from 0.3 to 0.2

                const dummy = new THREE.Object3D();
                const voxelData = [];
                for (let i = 0; i < numVoxels; i++) {
                    // Spread a bit wider and taller to completely obscure cell
                    const vx = (Math.random() - 0.5) * 0.95;
                    const vy = (Math.random() - 0.5) * 0.4; // Halved from 0.8 to 0.4
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

                this.state.enemyBoardGroup.add(fogCloud);
                this.state.fogMeshes[z * boardSize + x] = fogCloud;
            }
        }

        // Holographic Grid Lines
        const pGrid = new THREE.GridHelper(boardSize, boardSize, 0x4169E1, 0x228B22); // Royal Blue / Forest Green
        pGrid.position.y = 0.05;
        pGrid.material.transparent = true; pGrid.material.opacity = 0.4;
        this.state.playerBoardGroup.add(pGrid);

        const eGrid = new THREE.GridHelper(boardSize, boardSize, 0xDC143C, 0xFF2400); // Crimson / Scarlet
        eGrid.position.y = 0.05;
        eGrid.material.transparent = true; eGrid.material.opacity = 0.4;
        this.state.enemyBoardGroup.add(eGrid);
    }
}
