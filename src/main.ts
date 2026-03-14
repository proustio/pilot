import { Engine3D } from './presentation/3d/Engine3D';
import { EntityManager } from './presentation/3d/entities/EntityManager';
import { InteractionManager } from './presentation/3d/interaction/InteractionManager';
import { GameLoop } from './application/game-loop/GameLoop';
import { UIManager } from './presentation/ui/UIManager';
import { Config } from './infrastructure/config/Config';
import { ViewState } from './infrastructure/storage/Storage';
console.log('Battleships: Initialization Started');

const init = () => {
    try {
        Config.loadConfig();

        const engine = new Engine3D('app');

        document.body.classList.add(Config.visual.isDayMode ? 'day-mode' : 'night-mode');

        const entityManager = new EntityManager(engine.scene);

        const interactionManager = new InteractionManager(
            engine.scene,
            engine.camera,
            entityManager
        );

        const gameLoop = new GameLoop();

        interactionManager.setGameLoop(gameLoop);

        // Bind TOGGLE_DAY_NIGHT to the 3D Engine
        document.addEventListener('TOGGLE_DAY_NIGHT', (e: Event) => {
            const ce = e as CustomEvent;
            engine.setDayMode(ce.detail.isDay);
        });

        interactionManager.onClick((hit: any) => {
            const gridX = hit.object.userData.cellX;
            const gridZ = hit.object.userData.cellZ;
            gameLoop.onGridClick(gridX, gridZ);
        });

        gameLoop.onShipPlaced((ship, x, z, orientation, isPlayer) => {
            entityManager.addShip(ship, x, z, orientation, isPlayer);
        });

        gameLoop.onAttackResult((x, z, result, isPlayer, isReplay) => {
            entityManager.addAttackMarker(x, z, result, isPlayer, isReplay);
        });

        let matchStartTime: number | null = null;
        let isRestoringState = false;

        gameLoop.onStateChange((newState) => {
            if (newState === 'SETUP_BOARD') {
                matchStartTime = performance.now();
            }

            if (isRestoringState) return;

            if (newState === 'SETUP_BOARD') {
                entityManager.showPlayerBoard();
                engine.targetCameraPos.set(0, 6, 8);
            } else if (newState === 'ENEMY_TURN') {
                entityManager.showPlayerBoard();
                engine.targetCameraPos.set(0, 8, 12);
            } else if (newState === 'PLAYER_TURN') {
                entityManager.showEnemyBoard();
                engine.targetCameraPos.set(0, 6, 8);
            }
        });

        const uiManager = new UIManager(gameLoop);
        (window as any).uiManager = uiManager;

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
                const fps = Math.round((framesRendered * 1000) / (time - lastFpsUpdateTime));
                document.dispatchEvent(new CustomEvent('UPDATE_GEEK_STATS', {
                    detail: { fps, frameTime: lastFrameTimeMs, matchStartTime }
                }));
                framesRendered = 0;
                lastFpsUpdateTime = time;
            }

            if (!gameLoop.isPaused) {
                interactionManager.update();
                entityManager.update();
            }

            engine.render();
        };

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

            engine.restoreViewState(vs.cameraX, vs.cameraY, vs.cameraZ, vs.targetX, vs.targetY, vs.targetZ);

            // Also directly jump the current camera to the saved position so it doesn't animate from default
            engine.camera.position.set(vs.cameraX, vs.cameraY, vs.cameraZ);
            engine.orbitControls.target.set(vs.targetX, vs.targetY, vs.targetZ);

            if (vs.boardOrientation === 'enemy') {
                entityManager.showEnemyBoard();
            } else {
                entityManager.showPlayerBoard();
            }

            // Clear restoring state after next tick so that state changes don't override the restored view
            setTimeout(() => { isRestoringState = false; }, 0);

            Config.visual.isDayMode = vs.isDayMode;
            document.body.classList.remove('day-mode', 'night-mode');
            document.body.classList.add(vs.isDayMode ? 'day-mode' : 'night-mode');
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
