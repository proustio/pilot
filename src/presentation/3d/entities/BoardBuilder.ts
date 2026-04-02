import * as THREE from 'three';
import { WaterShader } from '../materials/WaterShader';
import { Config } from '../../../infrastructure/config/Config';
import { FogManager } from './FogManager';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { BoardMeshFactory } from './BoardMeshFactory';
import { FogMeshFactory } from './FogMeshFactory';

export interface BoardBuildResult {
    playerGridTiles: THREE.Object3D[];
    enemyGridTiles: THREE.Object3D[];
    playerRaycastPlanes: THREE.Object3D[];
    enemyRaycastPlanes: THREE.Object3D[];
    playerWaterUniforms: any;
    enemyWaterUniforms: any;
    ledMesh: THREE.InstancedMesh;
    ledPhases: number[];
}

export class BoardBuilder {
    /**
     * Creates all board meshes by delegating structural elements to BoardMeshFactory,
     * fog setup to FogMeshFactory, and retaining water planes, grid tiles, raycast
     * planes, and theme listener setup.
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

        // ───── Structural Meshes (frame, base, brackets, rivets, screws, bottom) ─────
        const { frameMat, rivetMat, screwMat, ledMesh, ledPhases } = BoardMeshFactory.build(
            masterBoardGroup, staticGroup, boardSize, offset
        );

        // ───── Fog Setup ─────
        const { fogVoxelGeo, fogMat, numVoxels } = FogMeshFactory.build(fogManager);

        // ───── Water Planes ─────
        const createWaterUniforms = () => ({
            time: { value: 0 },
            baseColor: { value: new THREE.Color() },
            peakColor: { value: new THREE.Color() },
            opacity: { value: 0.85 },
            globalTurbulence: { value: 0.0 },
            rippleCenters: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
            rippleTimes: { value: [0.0, 0.0, 0.0, 0.0, 0.0] }
        });

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

        // ───── Theme Listener ─────
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

            // Update frame material map if theme changed significantly
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
            enemyWaterUniforms,
            ledMesh,
            ledPhases
        };
    }
}
