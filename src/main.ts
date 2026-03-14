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

        gameLoop.onStateChange((newState) => {
            if (newState === 'SETUP_BOARD') {
                matchStartTime = performance.now();
                entityManager.showPlayerBoard();
                engine.targetCameraPos.set(0, 10, 12);
            } else if (newState === 'ENEMY_TURN') {
                entityManager.showPlayerBoard();
                engine.targetCameraPos.set(0, 14, 18);
            } else if (newState === 'PLAYER_TURN') {
                entityManager.showEnemyBoard();
                engine.targetCameraPos.set(0, 12, 12);
            }
        });

        const uiManager = new UIManager(gameLoop);
        (window as any).uiManager = uiManager;

        const FPS_CAP = 60;
        const frameInterval = 1000 / FPS_CAP;
        let lastFrameTime = performance.now();

        let framesRendered = 0;
        let lastFpsUpdateTime = performance.now();
        let lastFrameTimeMs = 0;

        const animate = (time: DOMHighResTimeStamp) => {
            requestAnimationFrame(animate);

            const deltaTime = time - lastFrameTime;

            if (deltaTime < frameInterval) {
                return;
            }

            lastFrameTime = time - (deltaTime % frameInterval);
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

            engine.restoreViewState(vs.cameraX, vs.cameraY, vs.cameraZ, vs.targetX, vs.targetY, vs.targetZ);

            if (vs.boardOrientation === 'enemy') {
                entityManager.showEnemyBoard();
            } else {
                entityManager.showPlayerBoard();
            }

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
