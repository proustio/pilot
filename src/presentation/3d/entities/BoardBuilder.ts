import * as THREE from 'three';
import { WaterShader } from '../materials/WaterShader';
import { Config } from '../../../infrastructure/config/Config';
import { FogManager } from './FogManager';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import fogShaderMain from '../shaders/Fog.vert?raw';
import fogShaderNormal from '../shaders/FogNormal.vert?raw';
import fogShaderPosition from '../shaders/FogPosition.vert?raw';

export interface BoardBuildResult {
    playerGridTiles: THREE.Object3D[];
    enemyGridTiles: THREE.Object3D[];
    playerRaycastPlanes: THREE.Object3D[];
    enemyRaycastPlanes: THREE.Object3D[];
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
        const playerRaycastPlanes: THREE.Object3D[] = [];
        const enemyRaycastPlanes: THREE.Object3D[] = [];

        const boardSize = Config.board.width;
        const offset = boardSize / 2;

        const createWaterUniforms = () => ({
            time: { value: 0 },
            baseColor: { value: new THREE.Color() },
            peakColor: { value: new THREE.Color() },
            opacity: { value: 0.85 },
            globalTurbulence: { value: 0.0 },
            rippleCenters: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
            rippleTimes: { value: [0.0, 0.0, 0.0, 0.0, 0.0] }
        });

        const industrialTex = ThemeManager.getInstance().getIndustrialTexture();

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
        const tm = ThemeManager.getInstance();
        const rivetMat = new THREE.MeshStandardMaterial({ color: tm.getRivetColor(), metalness: 0.8, roughness: 0.2 });

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
            color: tm.getScrewColor(),
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

        const playerWaterUniforms = createWaterUniforms();
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

        const enemyWaterUniforms = createWaterUniforms();
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
        const tilePlayerMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.2, transparent: true, opacity: 0.1, depthWrite: false });
        const tileEnemyMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.2, transparent: true, opacity: 0.1, depthWrite: false });

        const fogVoxelGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const fogMat = new THREE.MeshStandardMaterial({
            color: 0x000080,
            emissive: 0x4169E1,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.85,
            roughness: 0.2,
            metalness: 0.8
        });

        fogMat.onBeforeCompile = (shader) => {
            shader.uniforms.uFogTime = { value: 0 };
            fogMat.userData.shader = shader;

            shader.vertexShader = `
                ${fogShaderMain}
                ${shader.vertexShader}
            `;

            shader.vertexShader = shader.vertexShader.replace(
                `#include <beginnormal_vertex>`,
                fogShaderNormal
            );

            shader.vertexShader = shader.vertexShader.replace(
                `#include <begin_vertex>`,
                fogShaderPosition
            );
        };

        const numVoxels = 250;
        const aBasePos = new Float32Array(numVoxels * 3);
        const aScale = new Float32Array(numVoxels);
        const aPhase = new Float32Array(numVoxels);
        const aSpeed = new Float32Array(numVoxels);

        for (let i = 0; i < numVoxels; i++) {
            aBasePos[i * 3 + 0] = (Math.random() - 0.5) * 0.95;
            // Compress the Y-axis distribution by half (0.9 -> 0.45)
            aBasePos[i * 3 + 1] = (Math.random() - 0.5) * 0.45;
            aBasePos[i * 3 + 2] = (Math.random() - 0.5) * 0.95;

            aScale[i] = 1.0 + Math.random() * 0.8;
            aPhase[i] = Math.random() * Math.PI * 2;
            aSpeed[i] = 0.5 + Math.random() * 1.5;
        }

        fogVoxelGeo.setAttribute('aBasePos', new THREE.InstancedBufferAttribute(aBasePos, 3));
        fogVoxelGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
        fogVoxelGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
        fogVoxelGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(aSpeed, 1));

        // For Rogue mode, create a reduced-voxel geometry (60 instead of 250)
        // The consolidated mesh in FogManager will use this as the base geometry
        if (fogManager.rogueMode) {
            const rogueNumVoxels = 60;
            const rogueGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
            const rBasePos = new Float32Array(rogueNumVoxels * 3);
            const rScale = new Float32Array(rogueNumVoxels);
            const rPhase = new Float32Array(rogueNumVoxels);
            const rSpeed = new Float32Array(rogueNumVoxels);

            for (let i = 0; i < rogueNumVoxels; i++) {
                rBasePos[i * 3 + 0] = (Math.random() - 0.5) * 0.95;
                rBasePos[i * 3 + 1] = (Math.random() - 0.5) * 0.45;
                rBasePos[i * 3 + 2] = (Math.random() - 0.5) * 0.95;
                rScale[i] = 1.0 + Math.random() * 0.8;
                rPhase[i] = Math.random() * Math.PI * 2;
                rSpeed[i] = 0.5 + Math.random() * 1.5;
            }

            rogueGeo.setAttribute('aBasePos', new THREE.InstancedBufferAttribute(rBasePos, 3));
            rogueGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(rScale, 1));
            rogueGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(rPhase, 1));
            rogueGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(rSpeed, 1));

            fogManager.initializeDynamicAssets(rogueGeo, fogMat);
        } else {
            fogManager.initializeDynamicAssets(fogVoxelGeo, fogMat);
        }

        const numTiles = boardSize * boardSize;
        const pGridInstanced = new THREE.InstancedMesh(tileGeometry, tilePlayerMat, numTiles);
        pGridInstanced.userData = { isInstancedGrid: true, isPlayerSide: true };
        playerBoardGroup.add(pGridInstanced);
        playerGridTiles.push(pGridInstanced);

        const eGridInstanced = new THREE.InstancedMesh(tileGeometry, tileEnemyMat, numTiles);
        eGridInstanced.userData = { isInstancedGrid: true, isPlayerSide: false };
        enemyBoardGroup.add(eGridInstanced);
        enemyGridTiles.push(eGridInstanced);

        const dummy = new THREE.Object3D();

        for (let z = 0; z < boardSize; z++) {
            for (let x = 0; x < boardSize; x++) {
                const worldX = x - offset + 0.5;
                const worldZ = z - offset + 0.5;
                const i = z * boardSize + x;

                dummy.position.set(worldX, 0, worldZ);
                dummy.updateMatrix();

                pGridInstanced.setMatrixAt(i, dummy.matrix);
                eGridInstanced.setMatrixAt(i, dummy.matrix);

                // Fog cloud (skip static creation if rogue mode)
                if (!fogManager.rogueMode) {
                    const fogCloud = new THREE.InstancedMesh(fogVoxelGeo, fogMat, numVoxels);
                    fogCloud.position.set(worldX, 0.0, worldZ);

                    const identity = new THREE.Matrix4();
                    for (let j = 0; j < numVoxels; j++) {
                        fogCloud.setMatrixAt(j, identity);
                    }

                    fogCloud.userData = { isFog: true };

                    enemyBoardGroup.add(fogCloud);
                    fogManager.setFogMesh(z * boardSize + x, fogCloud);
                }
            }
        }

        // Initialize consolidated fog mesh for Rogue mode (single InstancedMesh for all fog)
        if (fogManager.rogueMode) {
            fogManager.initConsolidatedFog(playerBoardGroup);
        }

        const pGrid = new THREE.GridHelper(boardSize, boardSize);
        pGrid.position.y = 0.05;
        pGrid.material.transparent = true; pGrid.material.opacity = 0.4;
        pGrid.material.depthWrite = false;
        (pGrid.material as any).vertexColors = false;
        playerBoardGroup.add(pGrid);

        const eGrid = new THREE.GridHelper(boardSize, boardSize);
        eGrid.position.y = 0.05;
        eGrid.material.transparent = true; eGrid.material.opacity = 0.4;
        eGrid.material.depthWrite = false;
        (eGrid.material as any).vertexColors = false;
        enemyBoardGroup.add(eGrid);

        // ───── Raycast Planes for Chromium Perf ─────
        const raycastGeo = new THREE.PlaneGeometry(boardSize, boardSize);
        raycastGeo.rotateX(-Math.PI / 2);
        const raycastMat = new THREE.MeshBasicMaterial({ depthWrite: false, colorWrite: false, transparent: true, opacity: 0 });

        const pRaycast = new THREE.Mesh(raycastGeo, raycastMat);
        pRaycast.position.y = 0.05;
        pRaycast.userData = { isRaycastPlane: true, isPlayerSide: true };
        playerBoardGroup.add(pRaycast);
        playerRaycastPlanes.push(pRaycast);

        const eRaycast = new THREE.Mesh(raycastGeo, raycastMat);
        eRaycast.position.y = 0.05;
        eRaycast.userData = { isRaycastPlane: true, isPlayerSide: false };
        enemyBoardGroup.add(eRaycast);
        enemyRaycastPlanes.push(eRaycast);

        const updateBoardTheme = () => {
            const tm = ThemeManager.getInstance();
            const wc = tm.getWaterColors();

            playerWaterUniforms.baseColor.value.copy(wc.primary);
            playerWaterUniforms.peakColor.value.copy(wc.secondary);
            enemyWaterUniforms.baseColor.value.copy(wc.primary);
            enemyWaterUniforms.peakColor.value.copy(wc.secondary);

            const pColor = tm.getPlayerShipColor();
            const eColor = tm.getEnemyShipColor();
            const bLinesColor = tm.getBoardLinesColor();

            tilePlayerMat.color.copy(pColor);
            tilePlayerMat.emissive.copy(pColor);

            tileEnemyMat.color.copy(eColor);
            tileEnemyMat.emissive.copy(eColor);

            (pGrid.material as any).color.copy(bLinesColor);
            (pGrid.material as any).needsUpdate = true;
            (eGrid.material as any).color.copy(bLinesColor);
            (eGrid.material as any).needsUpdate = true;

            rivetMat.color.copy(tm.getRivetColor());
            screwMat.color.copy(tm.getScrewColor());

            // Update frame material map if theme changed significantly (optional, or just update emissive)
            frameMat.map = tm.getIndustrialTexture();
        };

        eventBus.on(GameEventType.THEME_CHANGED, updateBoardTheme);
        updateBoardTheme(); // Run once to seed initial values

        return {
            playerGridTiles,
            enemyGridTiles,
            playerRaycastPlanes,
            enemyRaycastPlanes,
            playerWaterUniforms,
            enemyWaterUniforms
        };
    }
}
