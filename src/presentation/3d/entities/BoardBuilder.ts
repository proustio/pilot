import * as THREE from 'three';
import { WaterShader } from '../materials/WaterShader';
import { Config } from '../../../infrastructure/config/Config';
import { FogManager } from './FogManager';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

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

        const createWaterUniforms = () => ({
            time: { value: 0 },
            baseColor: { value: new THREE.Color() },
            peakColor: { value: new THREE.Color() },
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
                uniform float uFogTime;
                attribute vec3 aBasePos;
                attribute float aScale;
                attribute float aPhase;
                attribute float aSpeed;

                mat4 rotationXYZ(vec3 euler) {
                    float cX = cos(euler.x); float sX = sin(euler.x);
                    float cY = cos(euler.y); float sY = sin(euler.y);
                    float cZ = cos(euler.z); float sZ = sin(euler.z);
                    
                    mat4 rotX = mat4(1.0, 0.0, 0.0, 0.0,
                                     0.0, cX, sX, 0.0,
                                     0.0, -sX, cX, 0.0,
                                     0.0, 0.0, 0.0, 1.0);
                                     
                    mat4 rotY = mat4(cY, 0.0, -sY, 0.0,
                                     0.0, 1.0, 0.0, 0.0,
                                     sY, 0.0, cY, 0.0,
                                     0.0, 0.0, 0.0, 1.0);
                                     
                    mat4 rotZ = mat4(cZ, sZ, 0.0, 0.0,
                                     -sZ, cZ, 0.0, 0.0,
                                     0.0, 0.0, 1.0, 0.0,
                                     0.0, 0.0, 0.0, 1.0);
                                     
                    return rotZ * rotY * rotX;
                }
                
                ${shader.vertexShader}
            `;

            shader.vertexShader = shader.vertexShader.replace(
                `#include <beginnormal_vertex>`,
                `
                #include <beginnormal_vertex>
                
                // Use the cell's world position from modelMatrix to offset animation per-cell
                float cellOffset = modelMatrix[3].x * 0.8 + modelMatrix[3].z * 1.2;
                float fogCloudTime = uFogTime * 2.0;
                
                // Multiply by 2.0 to increase the maximum rotation angle to +/- 2 radians
                vec3 fogRot = vec3(
                    sin(fogCloudTime * 0.8 + aPhase + cellOffset) * 2.0,
                    cos(fogCloudTime * 0.7 + aPhase + cellOffset) * 2.0,
                    sin(fogCloudTime * 0.9 + aPhase + cellOffset) * 2.0
                );
                mat4 customRot = rotationXYZ(fogRot);
                
                objectNormal = (customRot * vec4(objectNormal, 0.0)).xyz;
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                `#include <begin_vertex>`,
                `
                #include <begin_vertex>
                
                transformed *= aScale;
                transformed = (customRot * vec4(transformed, 1.0)).xyz;
                
                vec3 fogPos = aBasePos;
                // Reuse the same cellOffset for vertical bobbing
                float cellOffsetBob = modelMatrix[3].x * 0.8 + modelMatrix[3].z * 1.2;
                // Halved amplitude from 0.4 to 0.2 to keep it wavy but not too tall
                fogPos.y += sin(fogCloudTime * aSpeed + aPhase + cellOffsetBob) * 0.2;
                transformed += fogPos;
                `
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

        fogManager.initializeDynamicAssets(fogVoxelGeo, fogMat);

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

                // Fog cloud (skip static creation if rogue mode)
                if (!fogManager.rogueMode) {
                    const fogCloud = new THREE.InstancedMesh(fogVoxelGeo, fogMat, numVoxels);
                    fogCloud.position.set(worldX, 0.0, worldZ);

                    const identity = new THREE.Matrix4();
                    for (let i = 0; i < numVoxels; i++) {
                        fogCloud.setMatrixAt(i, identity);
                    }
                    
                    fogCloud.userData = { isFog: true };

                    enemyBoardGroup.add(fogCloud);
                    fogManager.setFogMesh(z * boardSize + x, fogCloud);
                }
            }
        }

        // ───── Grid Lines ─────
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
        };

        eventBus.on(GameEventType.THEME_CHANGED, updateBoardTheme);
        updateBoardTheme(); // Run once to seed initial values

        return {
            playerGridTiles,
            enemyGridTiles,
            playerWaterUniforms,
            enemyWaterUniforms
        };
    }
}
