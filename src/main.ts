import { Engine3D } from './presentation/3d/Engine3D';
import { EntityManager } from './presentation/3d/entities/EntityManager';
import { InteractionManager } from './presentation/3d/interaction/InteractionManager';
import { GameLoop, GameState } from './application/game-loop/GameLoop';
import { MatchMode } from './domain/match/Match';
import { UIManager } from './presentation/ui/UIManager';
import { Config } from './infrastructure/config/Config';
import { Storage, ViewState } from './infrastructure/storage/Storage';
import { AudioEngine } from './infrastructure/audio/AudioEngine';
import { ThemeManager } from './presentation/theme/ThemeManager';

const init = () => {
    try {
        Config.loadConfig();
        
        ThemeManager.getInstance().applyToDOM();

        const engine = new Engine3D('app');

        const entityManager = new EntityManager(engine.scene);

        const interactionManager = new InteractionManager(
            engine.scene,
            engine.camera,
            entityManager
        );

        const gameLoop = new GameLoop(Config, Storage);

        interactionManager.setGameLoop(gameLoop);

        // Bind TOGGLE_DAY_NIGHT to the 3D Engine
        document.addEventListener('TOGGLE_DAY_NIGHT', (e: Event) => {
            const ce = e as CustomEvent;
            engine.setDayMode(ce.detail.isDay);
        });

        interactionManager.onClick((hit: any) => {
            const gridX = hit.object.userData.cellX;
            const gridZ = hit.object.userData.cellZ;
            const isPlayerSide = hit.object.userData.isPlayerSide;
            gameLoop.onGridClick(gridX, gridZ, isPlayerSide);
        });

        gameLoop.onShipPlaced((ship, x, z, orientation, isPlayer) => {
            entityManager.addShip(ship, x, z, orientation, isPlayer);
        });

        gameLoop.onShipMoved((ship, x, z, orientation) => {
            entityManager.moveShip3D(ship, x, z, orientation);
        });

        gameLoop.onAttackResult((x, z, result, isPlayer, isReplay) => {
            entityManager.addAttackMarker(x, z, result, isPlayer, isReplay);
        });

        let matchStartTime: number | null = null;
        let elapsedActiveTime: number = 0;
        let isRestoringState = false;

        gameLoop.onStateChange((newState) => {
            const isRogue = gameLoop.match?.mode === MatchMode.Rogue;
            entityManager.setPlayerTurn(newState === 'PLAYER_TURN');
            entityManager.setSetupPhase(newState === 'SETUP_BOARD');

            if (newState === 'SETUP_BOARD') {
                matchStartTime = performance.now();
                elapsedActiveTime = 0;
                if (!isRestoringState) {
                    engine.hasManualMovement = false;
                }
            }

            if (isRestoringState) return;

            if (newState === 'SETUP_BOARD') {
                entityManager.showPlayerBoard();
                if (!engine.hasManualMovement) {
                    document.dispatchEvent(new CustomEvent('SET_CAMERA_TARGET', { detail: { x: 0, y: 12, z: 0.1 } }));
                }
            } else if (newState === 'ENEMY_TURN') {
                entityManager.showPlayerBoard(); // Always show player (shared) board in Rogue
                if (!engine.hasManualMovement) {
                    if (isRogue) {
                        document.dispatchEvent(new CustomEvent('SET_CAMERA_TARGET', { detail: { x: 0, y: 14, z: 12 } }));
                    } else {
                        document.dispatchEvent(new CustomEvent('SET_CAMERA_TARGET', { detail: { x: 0, y: 8, z: 12 } }));
                    }
                }
            } else if (newState === 'PLAYER_TURN') {
                if (isRogue) {
                    entityManager.showPlayerBoard();
                    if (!engine.hasManualMovement) {
                        document.dispatchEvent(new CustomEvent('SET_CAMERA_TARGET', { detail: { x: 0, y: 14, z: 6 } }));
                    }
                } else {
                    entityManager.showEnemyBoard();
                    if (!engine.hasManualMovement) {
                        document.dispatchEvent(new CustomEvent('SET_CAMERA_TARGET', { detail: { x: 5, y: 10, z: 14 } }));
                    }
                }
            }
        });

        // --- Unified Save & Restore Logic ---
        const performSave = (slotId: number | 'session') => {
            if (!gameLoop.match) return;

            const isEnemyBoardShowing = entityManager.boardOrientation === 'enemy';
            const vs: ViewState = {
                cameraX: parseFloat(engine.camera.position.x.toFixed(4)),
                cameraY: parseFloat(engine.camera.position.y.toFixed(4)),
                cameraZ: parseFloat(engine.camera.position.z.toFixed(4)),
                cameraDist: parseFloat(engine.orbitControls.getDistance().toFixed(4)),
                targetX: parseFloat(engine.orbitControls.target.x.toFixed(4)),
                targetY: parseFloat(engine.orbitControls.target.y.toFixed(4)),
                targetZ: parseFloat(engine.orbitControls.target.z.toFixed(4)),
                boardOrientation: isEnemyBoardShowing ? 'enemy' : 'player',
                isDayMode: Config.visual.isDayMode,
                gameSpeedMultiplier: Config.timing.gameSpeedMultiplier,
                gameState: gameLoop.currentState
            };

            console.log(`%c💾 Saving View State [${slotId}]`, 'color: #00ff00; font-weight: bold;');
            console.table(vs);

            document.dispatchEvent(new CustomEvent('SAVE_GAME', {
                detail: { 
                    slotId, 
                    viewState: vs,
                    activeRogueShipIndex: gameLoop.activeRogueShipIndex,
                    activeEnemyRogueShipIndex: gameLoop.activeEnemyRogueShipIndex
                }
            }));
        };

        document.addEventListener('REQUEST_AUTO_SAVE', (e: Event) => {
            const ce = e as CustomEvent;
            performSave(ce.detail?.slotId || 'session');
        });

        document.addEventListener('SAVE_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            if (!ce.detail?.viewState && ce.detail?.slotId && ce.detail.slotId !== 'session') {
                e.stopImmediatePropagation();
                performSave(ce.detail.slotId);
            }
        }, true);

        document.addEventListener('RESTORE_VIEW_STATE', (e: Event) => {
            const ce = e as CustomEvent;
            const vs: any = ce.detail;
            
            console.log(`%c🔄 Restoring View State [Source: ${vs?.source || 'Unknown'}]`, 'color: #00ffff; font-weight: bold;');
            console.table(vs);
            
            const defPos = { x: 5.0233, y: 10.0466, z: 14.0652 };
            const defTgt = { x: 0, y: 0, z: 0 };
            const defDist = 18;

            const camX = vs?.cameraX ?? defPos.x;
            const camY = vs?.cameraY ?? defPos.y;
            const camZ = vs?.cameraZ ?? defPos.z;
            const tgtX = vs?.targetX ?? defTgt.x;
            const tgtY = vs?.targetY ?? defTgt.y;
            const tgtZ = vs?.targetZ ?? defTgt.z;
            const camDist = vs?.cameraDist ?? defDist;

            isRestoringState = true;
            engine.hasManualMovement = vs ? true : false; 
            engine.restoreViewState(camX, camY, camZ, tgtX, tgtY, tgtZ, camDist);

            if (vs?.boardOrientation === 'enemy') {
                entityManager.showEnemyBoard();
            } else {
                entityManager.showPlayerBoard();
            }

            setTimeout(() => { isRestoringState = false; }, 0);

            const isDay = vs?.isDayMode ?? Config.visual.isDayMode;
            Config.visual.isDayMode = isDay;
            ThemeManager.getInstance().applyToDOM();
            engine.setDayMode(isDay);
            document.dispatchEvent(new CustomEvent('TOGGLE_DAY_NIGHT', { detail: { isDay } }));

            const speed = vs?.gameSpeedMultiplier ?? Config.timing.gameSpeedMultiplier;
            Config.timing.gameSpeedMultiplier = speed;
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed: speed.toFixed(1) } }));
        });

        document.addEventListener('TOGGLE_PEEK', (e: Event) => {
            const ce = e as CustomEvent;
            const peeking = ce.detail?.peeking;
            const currentState = gameLoop.currentState;
            if (peeking) {
                if (currentState === GameState.PLAYER_TURN) entityManager.showPlayerBoard();
                else entityManager.showEnemyBoard();
                document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
            } else {
                if (currentState === GameState.PLAYER_TURN) entityManager.showEnemyBoard();
                else entityManager.showPlayerBoard();
                document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
            }
        });

        document.addEventListener('TURN_CHANGED', () => {
            entityManager.onTurnChange();
        });

        let isQuitting = false;
        document.addEventListener('EXIT_GAME', () => {
            isQuitting = true;
        });

        window.addEventListener('beforeunload', () => {
            if (!isQuitting && gameLoop.match && gameLoop.hasUnsavedProgress()) {
                const isEnemyBoardShowing = entityManager.boardOrientation === 'enemy';
                const vs: ViewState = {
                    cameraX: engine.camera.position.x,
                    cameraY: engine.camera.position.y,
                    cameraZ: engine.camera.position.z,
                    cameraDist: engine.orbitControls.getDistance(),
                    targetX: engine.orbitControls.target.x,
                    targetY: engine.orbitControls.target.y,
                    targetZ: engine.orbitControls.target.z,
                    boardOrientation: isEnemyBoardShowing ? 'enemy' : 'player',
                    isDayMode: Config.visual.isDayMode,
                    gameSpeedMultiplier: Config.timing.gameSpeedMultiplier,
                    gameState: gameLoop.currentState
                };
                Storage.saveGame('session', gameLoop.match, vs, gameLoop.activeRogueShipIndex, gameLoop.activeEnemyRogueShipIndex);
            }
        });

        const uiManager = new UIManager(gameLoop, entityManager);
        (window as any).uiManager = uiManager;

        // Global Audio Resume on first interaction
        window.addEventListener('mousedown', () => {
            AudioEngine.getInstance().resume();
        }, { once: true });
        window.addEventListener('keydown', () => {
            AudioEngine.getInstance().resume();
        }, { once: true });

        let currentFpsCap = Config.visual.fpsCap || 60;
        let frameInterval = 1000 / currentFpsCap;

        document.addEventListener('SET_FPS_CAP', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.fpsCap) {
                currentFpsCap = ce.detail.fpsCap;
                frameInterval = 1000 / currentFpsCap;
            }
        });

        let lastFrameTime = performance.now();

        let framesRendered = 0;
        let lastFpsUpdateTime = performance.now();
        let lastFrameTimeMs = 0;
        let lastTotalNetDown = 0;

        const animate = (time: DOMHighResTimeStamp) => {
            const animateStart = performance.now();
            requestAnimationFrame(animate);

            const deltaTime = time - lastFrameTime;

            // allow a tiny epsilon for floating point inaccuracy in rAF
            if (deltaTime < frameInterval - 0.1) {
                return;
            }

            // Simple update to last frame time without strict modulo to fix jitter
            lastFrameTime = time;
            lastFrameTimeMs = deltaTime;

            if (!gameLoop.isPaused) {
                elapsedActiveTime += deltaTime;
            }

            framesRendered++;
            if (time - lastFpsUpdateTime >= 1000) {
                const fpsValue = Math.round((framesRendered * 1000) / (time - lastFpsUpdateTime));
                
                const mem = (performance as any).memory;
                const ramMB = mem ? (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1) : 'N/A';

                const totalNetDown = performance.getEntriesByType('resource')
                    .reduce((acc, entry) => acc + (entry as PerformanceResourceTiming).transferSize, 0);
                const netDownSpeed = Math.max(0, totalNetDown - lastTotalNetDown);
                lastTotalNetDown = totalNetDown;

                const animateEnd = performance.now();
                const jsDuration = animateEnd - animateStart;
                const cpuLoad = Math.min(100, (jsDuration / frameInterval) * 100);

                document.dispatchEvent(new CustomEvent('UPDATE_GEEK_STATS', {
                    detail: {
                        fps: fpsValue,
                        frameTime: lastFrameTimeMs,
                        ram: ramMB,
                        cpuLoad: cpuLoad,
                        gpuCalls: engine.renderer.info.render.calls,
                        gpuTris: engine.renderer.info.render.triangles,
                        netDown: netDownSpeed,
                        netUp: undefined, // Not typically trackable in JS without interception
                        elapsedActiveTime,
                        matchStartTime,
                        zoom: engine.orbitControls.getDistance(),
                        cameraPos: engine.camera.position,
                        targetPos: engine.orbitControls.target
                    }
                }));
                framesRendered = 0;
                lastFpsUpdateTime = time;
            }

            if (!gameLoop.isPaused) {
                interactionManager.update();
                entityManager.update(engine.camera);
            }
            uiManager.update();

            engine.render();
        };

        // Persistent Camera Sync
        let cameraAutoSaveTimeout: any = null;
        engine.orbitControls.addEventListener('end', () => {
            if (cameraAutoSaveTimeout) clearTimeout(cameraAutoSaveTimeout);
            cameraAutoSaveTimeout = setTimeout(() => {
                gameLoop.requestAutoSave();
            }, 1000); 
        });

        animate(performance.now());
        console.log('App successfully initialized, loop running.');

    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
