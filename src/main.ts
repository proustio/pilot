import { Engine3D } from './presentation/3d/Engine3D';
import { EntityManager } from './presentation/3d/entities/EntityManager';
import { InteractionManager } from './presentation/3d/interaction/InteractionManager';
import { GameLoop } from './application/game-loop/GameLoop';
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
        let isRestoringState = false;

        gameLoop.onStateChange((newState) => {
            const isRogue = gameLoop.match?.mode === MatchMode.Rogue;

            if (newState === 'SETUP_BOARD') {
                matchStartTime = performance.now();
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

        const uiManager = new UIManager(gameLoop);
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

        const animate = (time: DOMHighResTimeStamp) => {
            requestAnimationFrame(animate);

            const deltaTime = time - lastFrameTime;

            // allow a tiny epsilon for floating point inaccuracy in rAF
            if (deltaTime < frameInterval - 0.1) {
                return;
            }

            // Simple update to last frame time without strict modulo to fix jitter
            lastFrameTime = time;
            lastFrameTimeMs = deltaTime;

            framesRendered++;
            if (time - lastFpsUpdateTime >= 1000) {
                const fpsValue = Math.round((framesRendered * 1000) / (time - lastFpsUpdateTime));
                const mem = (performance as any).memory;
                const ramMB = mem ? (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1) : 'N/A';

                document.dispatchEvent(new CustomEvent('UPDATE_GEEK_STATS', {
                    detail: {
                        fps: fpsValue,
                        frameTime: lastFrameTimeMs,
                        ram: ramMB,
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
                uiManager.update();
            }

            engine.render();
        };

        // Persistent Camera Sync
        let cameraAutoSaveTimeout: any = null;
        engine.orbitControls.addEventListener('end', () => {
            if (cameraAutoSaveTimeout) clearTimeout(cameraAutoSaveTimeout);
            cameraAutoSaveTimeout = setTimeout(() => {
                gameLoop.triggerAutoSave();
            }, 1000); // 1 second debounce
        });

        document.addEventListener('SAVE_GAME', (e: Event) => {

            const ce = e as CustomEvent;
            if (!ce.detail?.viewState && gameLoop.match) {
                const isEnemyBoardShowing = entityManager.boardOrientation === 'enemy';
                const vs: ViewState = {
                    cameraX: engine.camera.position.x,
                    cameraY: engine.camera.position.y,
                    cameraZ: engine.camera.position.z,
                    targetX: engine.orbitControls.target.x,
                    targetY: engine.orbitControls.target.y,
                    targetZ: engine.orbitControls.target.z,
                    boardOrientation: isEnemyBoardShowing ? 'enemy' : 'player',
                    isDayMode: Config.visual.isDayMode,
                    gameSpeedMultiplier: Config.timing.gameSpeedMultiplier,
                    gameState: gameLoop.currentState
                };
                document.dispatchEvent(new CustomEvent('SAVE_GAME', {
                    detail: { slotId: ce.detail?.slotId, viewState: vs }
                }));
            }
        }, true);

        document.addEventListener('RESTORE_VIEW_STATE', (e: Event) => {
            const ce = e as CustomEvent;
            const vs: ViewState = ce.detail;
            if (!vs) return;

            isRestoringState = true;
            engine.hasManualMovement = true; // Restored state counts as manual/persistent


            // Also directly jump the current camera to the saved position so it doesn't animate from default
            engine.camera.position.set(vs.cameraX, vs.cameraY, vs.cameraZ);
            engine.orbitControls.target.set(vs.targetX, vs.targetY, vs.targetZ);
            engine.orbitControls.update();

            if (vs.boardOrientation === 'enemy') {
                entityManager.showEnemyBoard();
            } else {
                entityManager.showPlayerBoard();
            }

            // Clear restoring state after next tick so that state changes don't override the restored view
            setTimeout(() => { isRestoringState = false; }, 0);

            Config.visual.isDayMode = vs.isDayMode;
            ThemeManager.getInstance().applyToDOM();
            engine.setDayMode(vs.isDayMode);
            document.dispatchEvent(new CustomEvent('TOGGLE_DAY_NIGHT', { detail: { isDay: vs.isDayMode } }));

            Config.timing.gameSpeedMultiplier = vs.gameSpeedMultiplier;
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed: vs.gameSpeedMultiplier.toFixed(1) } }));
        });

        document.addEventListener('TOGGLE_PEEK', (e: Event) => {
            const ce = e as CustomEvent;
            const peeking = ce.detail?.peeking;

            if (peeking) {
                const currentState = gameLoop.currentState;
                if (currentState === 'PLAYER_TURN') {
                    entityManager.showPlayerBoard();
                } else if (currentState === 'ENEMY_TURN') {
                    entityManager.showEnemyBoard();
                } else if (currentState === 'SETUP_BOARD') {
                    entityManager.showEnemyBoard();
                }
                document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
            } else {
                const currentState = gameLoop.currentState;
                if (currentState === 'PLAYER_TURN') {
                    entityManager.showEnemyBoard();
                } else {
                    entityManager.showPlayerBoard();
                }
                document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
            }
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
                    targetX: engine.orbitControls.target.x,
                    targetY: engine.orbitControls.target.y,
                    targetZ: engine.orbitControls.target.z,
                    boardOrientation: isEnemyBoardShowing ? 'enemy' : 'player',
                    isDayMode: Config.visual.isDayMode,
                    gameSpeedMultiplier: Config.timing.gameSpeedMultiplier,
                    gameState: gameLoop.currentState
                };
                Storage.saveGame('session', gameLoop.match, vs);
            }
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
