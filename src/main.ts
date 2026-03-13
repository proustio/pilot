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
        // 1. Initialize core 3D Engine
        const engine = new Engine3D('app');

        // Set initial theme class on body
        document.body.classList.add(Config.visual.isDayMode ? 'day-mode' : 'night-mode');

        // 2. Initialize Game Entities (Board, Ships placeholder)
        const entityManager = new EntityManager(engine.scene);

        // 3. Initialize Interaction (Raycasting, Hovering)
        const interactionManager = new InteractionManager(
            engine.scene,
            engine.camera,
            entityManager
        );

        // 4. Initialize Core Game Loop Logic
        const gameLoop = new GameLoop();

        // Pass gameLoop to InteractionManager for context-aware raycasting
        interactionManager.setGameLoop(gameLoop);

        // Connect 3D clicks to GameLoop logic
        interactionManager.onClick((hit: any) => {
            const gridX = hit.object.userData.cellX;
            const gridZ = hit.object.userData.cellZ;
            gameLoop.onGridClick(gridX, gridZ);
        });

        // Register entity listeners BEFORE UIManager so checkAutoLoad's replayShips() can reach them
        gameLoop.onShipPlaced((ship, x, z, orientation, isPlayer) => {
            entityManager.addShip(ship, x, z, orientation, isPlayer);
        });

        gameLoop.onAttackResult((x, z, result, isPlayer, isReplay) => {
            entityManager.addAttackMarker(x, z, result, isPlayer, isReplay);
        });

        let matchStartTime: number | null = null;

        // Listen for internal game state to flip board
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

        // 5. Initialize UI Manager (Hooks UI into GameLoop)
        // NOTE: UIManager constructor calls checkAutoLoad which triggers replayShips — must come after listener setup above
        const uiManager = new UIManager(gameLoop);
        (window as any).uiManager = uiManager; // Expose to window for debugging and prevent unused warning


        // Define the main render loop with a 60 FPS cap
        const FPS_CAP = 60;
        const frameInterval = 1000 / FPS_CAP;
        let lastFrameTime = performance.now();

        // Geek Stats variables
        let framesRendered = 0;
        let lastFpsUpdateTime = performance.now();
        let lastFrameTimeMs = 0;

        const animate = (time: DOMHighResTimeStamp) => {
            requestAnimationFrame(animate);

            const deltaTime = time - lastFrameTime;

            if (deltaTime < frameInterval) {
                // Skip frame if it arrived too early to enforce FPS cap
                return;
            }

            lastFrameTime = time - (deltaTime % frameInterval);
            lastFrameTimeMs = deltaTime;

            // Calculate FPS & dispatch geek stats
            framesRendered++;
            if (time - lastFpsUpdateTime >= 1000) {
                const fps = Math.round((framesRendered * 1000) / (time - lastFpsUpdateTime));
                document.dispatchEvent(new CustomEvent('UPDATE_GEEK_STATS', {
                    detail: { fps, frameTime: lastFrameTimeMs, matchStartTime }
                }));
                framesRendered = 0;
                lastFpsUpdateTime = time;
            }

            // Update systems if not paused
            if (!gameLoop.isPaused) {
                interactionManager.update();
                entityManager.update();
            }

            // Render frame
            engine.render();
        };

        // Intercept SAVE_GAME before it reaches GameLoop to inject current viewState
        document.addEventListener('SAVE_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            if (!ce.detail?.viewState && gameLoop.match) {
                // Build viewState from live engine/entity state
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
                // Re-dispatch with viewState attached (GameLoop picks it up)
                document.dispatchEvent(new CustomEvent('SAVE_GAME', {
                    detail: { slotId: ce.detail?.slotId, viewState: vs }
                }));
            }
        }, true); // capture phase so we intercept before GameLoop's bubble listener

        // Restore view state on game load
        document.addEventListener('RESTORE_VIEW_STATE', (e: Event) => {
            const ce = e as CustomEvent;
            const vs: ViewState = ce.detail;
            if (!vs) return;

            // Restore camera
            engine.restoreViewState(vs.cameraX, vs.cameraY, vs.cameraZ, vs.targetX, vs.targetY, vs.targetZ);

            // Restore board orientation
            if (vs.boardOrientation === 'enemy') {
                entityManager.showEnemyBoard();
            } else {
                entityManager.showPlayerBoard();
            }

            // Restore day/night
            Config.visual.isDayMode = vs.isDayMode;
            document.body.classList.remove('day-mode', 'night-mode');
            document.body.classList.add(vs.isDayMode ? 'day-mode' : 'night-mode');
            engine.setDayMode(vs.isDayMode);
            document.dispatchEvent(new CustomEvent('TOGGLE_DAY_NIGHT', { detail: { isDay: vs.isDayMode } }));

            // Restore game speed
            Config.timing.gameSpeedMultiplier = vs.gameSpeedMultiplier;
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed: vs.gameSpeedMultiplier.toFixed(1) } }));
        });

        // Peek at other side toggle
        document.addEventListener('TOGGLE_PEEK', (e: Event) => {
            const ce = e as CustomEvent;
            const peeking = ce.detail?.peeking;

            if (peeking) {
                // Flip the board to show the opposite side temporarily
                const currentState = gameLoop.currentState;
                if (currentState === 'PLAYER_TURN') {
                    // Player normally sees enemy board; peek shows player board
                    entityManager.showPlayerBoard();
                } else if (currentState === 'ENEMY_TURN') {
                    // Enemy turn normally shows player board; peek shows enemy board
                    entityManager.showEnemyBoard();
                } else if (currentState === 'SETUP_BOARD') {
                    // During setup, player sees own board; peek shows enemy side
                    entityManager.showEnemyBoard();
                }
                // Disable interaction while peeking
                document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
            } else {
                // Restore the correct board for the current state
                const currentState = gameLoop.currentState;
                if (currentState === 'PLAYER_TURN') {
                    entityManager.showEnemyBoard();
                } else {
                    entityManager.showPlayerBoard();
                }
                // Re-enable interaction
                document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
            }
        });

        // Start loop
        animate(performance.now());
        console.log('App successfully initialized, loop running.');

    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
};

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
