import * as THREE from 'three';
import { WaterShader } from '../materials/WaterShader';
import { Config } from '../../../infrastructure/config/Config';
import { FogManager } from './FogManager';

export interface BoardBuildResult {
    playerGridTiles: THREE.Object3D[];
    enemyGridTiles: THREE.Object3D[];
    playerWaterUniforms: any;
    enemyWaterUniforms: any;
}

export class BoardBuilder {
    /**
     * Creates all board meshes: frame, base, brackets, rivets, screws, water planes,
     * grid tiles (player + enemy), fog voxel clouds, and holographic grid lines.
     *
     * Returns references that EntityManager needs to retain.
     */
    public static build(
        masterBoardGroup: THREE.Group,
        staticGroup: THREE.Group,
        playerBoardGroup: THREE.Group,
        enemyBoardGroup: THREE.Group,
        fogManager: FogManager
    ): BoardBuildResult {
        const playerGridTiles: THREE.Object3D[] = [];
        const enemyGridTiles: THREE.Object3D[] = [];

        const boardSize = Config.board.width;
        const offset = boardSize / 2;

        const createWaterUniforms = (isEnemy: boolean) => ({
            time: { value: 0 },
            baseColor: { value: isEnemy ? new THREE.Color(0x8B0000) : new THREE.Color(0x000080) },
            peakColor: { value: isEnemy ? new THREE.Color(0xDC143C) : new THREE.Color(0x4169E1) },
            opacity: { value: 0.85 },
            globalTurbulence: { value: 0.0 },
            rippleCenters: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
            rippleTimes: { value: [0.0, 0.0, 0.0, 0.0, 0.0] }
        });

        // ───── Industrial Texture (Procedural) ─────
        const createIndustrialTexture = () => {
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;

            ctx.fillStyle = '#050515';
            ctx.fillRect(0, 0, size, size);

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

        // ───── Frame Material ─────
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

        // ───── Frame Borders ─────
        const borders = [
            { x: borderLength, y: 0.15, z: 0.15, posZ: -borderOffset, posX: 0 },
            { x: borderLength, y: 0.15, z: 0.15, posZ: borderOffset, posX: 0 },
            { x: 0.15, y: 0.15, z: borderLength, posZ: 0, posX: -borderOffset },
            { x: 0.15, y: 0.15, z: borderLength, posZ: 0, posX: borderOffset }
        ];

        borders.forEach(b => {
            const borderGeo = new THREE.BoxGeometry(b.x, b.y, b.z);
            const borderMesh = new THREE.Mesh(borderGeo, frameMat);
            borderMesh.position.set(b.posX, 0, b.posZ);
            borderMesh.castShadow = true;
            borderMesh.receiveShadow = true;
            masterBoardGroup.add(borderMesh);
        });

        // ───── Tactical Base ─────
        const baseGeo = new THREE.BoxGeometry(boardSize + 2, 0.4, boardSize + 2);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x050510,
            metalness: 0.9,
            roughness: 0.4,
            transparent: true,
            opacity: 0.8
        });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.y = -2.4;
        staticGroup.add(baseMesh);

        // ───── Corner Brackets + LEDs ─────
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
            bracket.position.set(pos.x, -1.8, pos.z);
            staticGroup.add(bracket);

            const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
            const ledMat = new THREE.MeshBasicMaterial({ color: 0x4169E1, transparent: true });
            const led = new THREE.Mesh(ledGeo, ledMat);
            led.position.set(pos.x * 1.1, 0.2, pos.z * 1.1);
            led.userData = { isStatusLED: true, phase: Math.random() * Math.PI };
            staticGroup.add(led);
        });

        // ───── Rivets ─────
        const rivetGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6);
        const rivetMat = new THREE.MeshStandardMaterial({ color: 0x444455, metalness: 0.8, roughness: 0.2 });

        const spawnRivets = (count: number, start: THREE.Vector3, end: THREE.Vector3) => {
            for (let i = 0; i < count; i++) {
                const rivet = new THREE.Mesh(rivetGeo, rivetMat);
                const t = i / (count - 1);
                rivet.position.lerpVectors(start, end, t);
                masterBoardGroup.add(rivet);
            }
        };

        const rD = borderOffset;
        const rH = 0.08;
        spawnRivets(8, new THREE.Vector3(-offset, rH, rD), new THREE.Vector3(offset, rH, rD));
        spawnRivets(8, new THREE.Vector3(-offset, rH, -rD), new THREE.Vector3(offset, rH, -rD));
        spawnRivets(8, new THREE.Vector3(rD, rH, -offset), new THREE.Vector3(rD, rH, offset));
        spawnRivets(8, new THREE.Vector3(-rD, rH, -offset), new THREE.Vector3(-rD, rH, offset));

        // ───── Screws ─────
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
            staticGroup.add(topScrew);
        });

        // ───── Bottom Plane ─────
        const bottomGeo = new THREE.PlaneGeometry(boardSize, boardSize);
        const bottomMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.4,
            roughness: 0.6,
            side: THREE.DoubleSide
        });
        const bottomPlane = new THREE.Mesh(bottomGeo, bottomMat);
        bottomPlane.rotation.x = -Math.PI / 2;
        bottomPlane.position.y = 0;
        bottomPlane.receiveShadow = true;
        masterBoardGroup.add(bottomPlane);

        // ───── Water Planes ─────
        const boardWaterGeo = new THREE.PlaneGeometry(boardSize, boardSize, 32, 32);

        const playerWaterUniforms = createWaterUniforms(false);
        const playerWaterMat = new THREE.ShaderMaterial({
            vertexShader: WaterShader.vertexShader,
            fragmentShader: WaterShader.fragmentShader,
            uniforms: playerWaterUniforms,
            transparent: true,
            side: THREE.FrontSide
        });
        const playerWaterPlane = new THREE.Mesh(boardWaterGeo, playerWaterMat);
        playerWaterPlane.rotation.x = -Math.PI / 2;
        playerWaterPlane.position.y = -0.25;
        playerWaterPlane.receiveShadow = true;
        playerBoardGroup.add(playerWaterPlane);

        const enemyWaterUniforms = createWaterUniforms(true);
        const enemyWaterMat = new THREE.ShaderMaterial({
            vertexShader: WaterShader.vertexShader,
            fragmentShader: WaterShader.fragmentShader,
            uniforms: enemyWaterUniforms,
            transparent: true,
            side: THREE.FrontSide
        });
        const enemyWaterPlane = new THREE.Mesh(boardWaterGeo, enemyWaterMat);
        enemyWaterPlane.rotation.x = -Math.PI / 2;
        enemyWaterPlane.position.y = -0.25;
        enemyWaterPlane.receiveShadow = true;
        enemyBoardGroup.add(enemyWaterPlane);

        // ───── Grid Tiles + Fog ─────
        const tileGeometry = new THREE.BoxGeometry(0.95, 0.1, 0.95);
        const tilePlayerMat = new THREE.MeshStandardMaterial({ color: 0x000080, emissive: 0x228B22, emissiveIntensity: 0.2, transparent: true, opacity: 0.1, depthWrite: false });
        const tileEnemyMat = new THREE.MeshStandardMaterial({ color: 0x8B0000, emissive: 0xDC143C, emissiveIntensity: 0.2, transparent: true, opacity: 0.1, depthWrite: false });

        const fogVoxelGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const fogMat = new THREE.MeshStandardMaterial({
            color: 0x000080,
            emissive: 0x4169E1,
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

                // Player tile
                const ptile = new THREE.Mesh(tileGeometry, tilePlayerMat);
                ptile.position.set(worldX, 0, worldZ);
                ptile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: true };
                playerBoardGroup.add(ptile);
                playerGridTiles.push(ptile);

                // Enemy tile
                const etile = new THREE.Mesh(tileGeometry, tileEnemyMat);
                etile.position.set(worldX, 0, worldZ);
                etile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: false };
                enemyBoardGroup.add(etile);
                enemyGridTiles.push(etile);

                // Fog cloud
                const numVoxels = 100;
                const fogCloud = new THREE.InstancedMesh(fogVoxelGeo, fogMat, numVoxels);
                fogCloud.position.set(worldX, 0.2, worldZ);

                const dummy = new THREE.Object3D();
                const voxelData = [];
                for (let i = 0; i < numVoxels; i++) {
                    const vx = (Math.random() - 0.5) * 0.95;
                    const vy = (Math.random() - 0.5) * 0.4;
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

                enemyBoardGroup.add(fogCloud);
                fogManager.setFogMesh(z * boardSize + x, fogCloud);
            }
        }

        // ───── Grid Lines ─────
        const pGrid = new THREE.GridHelper(boardSize, boardSize, 0x4169E1, 0x228B22);
        pGrid.position.y = 0.05;
        pGrid.material.transparent = true; pGrid.material.opacity = 0.4;
        playerBoardGroup.add(pGrid);

        const eGrid = new THREE.GridHelper(boardSize, boardSize, 0xDC143C, 0xFF2400);
        eGrid.position.y = 0.05;
        eGrid.material.transparent = true; eGrid.material.opacity = 0.4;
        enemyBoardGroup.add(eGrid);

        return {
            playerGridTiles,
            enemyGridTiles,
            playerWaterUniforms,
            enemyWaterUniforms
        };
    }
}
