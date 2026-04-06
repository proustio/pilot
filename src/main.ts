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
import { GameRunner } from './application/game-loop/GameRunner';
import { eventBus, GameEventType } from './application/events/GameEventBus';
import { NetworkManager } from './infrastructure/network/NetworkManager';
import { InteractivityGuard } from './presentation/InteractivityGuard';

import { InteractionDebouncer } from './presentation/ui/utils/InteractionDebouncer';

const init = () => {
    try {
        console.log(`[${new Date().toISOString()}] App: Initializing...`);
        Config.loadConfig();
        InteractionDebouncer.enable();
        NetworkManager.init(Config.network.serverUrl);
        
        ThemeManager.getInstance().applyToDOM();
        
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) {
            InteractivityGuard.init(uiLayer);
        }

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
        eventBus.on(GameEventType.TOGGLE_DAY_NIGHT, () => {
            engine.setDayMode(Config.visual.isDayMode);
        });

        interactionManager.onClick((gridX: number, gridZ: number, isPlayerSide: boolean) => {
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

        let isRestoringState = false;
        let gameRunner: GameRunner;

        gameLoop.onStateChange((newState) => {
            const isRogue = gameLoop.match?.mode === MatchMode.Rogue;
            entityManager.setPlayerTurn(newState === 'PLAYER_TURN');
            entityManager.setSetupPhase(newState === 'SETUP_BOARD');

            if (newState === 'SETUP_BOARD') {
                if (gameRunner) gameRunner.elapsedActiveTime = 0;
                entityManager.resetMatch();
                if (!isRestoringState) {
                    engine.hasManualMovement = false;
                }
            }

            if (isRestoringState) return;

            if (newState === 'SETUP_BOARD') {
                entityManager.showPlayerBoard();
                if (!engine.hasManualMovement) {
                    eventBus.emit(GameEventType.SET_CAMERA_TARGET, { x: 0, y: 12, z: 0.1 });
                }
            } else if (newState === 'ENEMY_TURN') {
                entityManager.showPlayerBoard(); // Always show player (shared) board in Rogue
                if (!engine.hasManualMovement) {
                    if (isRogue) {
                        eventBus.emit(GameEventType.SET_CAMERA_TARGET, { x: 0, y: 14, z: 12 });
                    } else {
                        eventBus.emit(GameEventType.SET_CAMERA_TARGET, { x: 0, y: 8, z: 12 });
                    }
                }
            } else if (newState === 'PLAYER_TURN') {
                if (isRogue) {
                    entityManager.showPlayerBoard();
                    if (!engine.hasManualMovement) {
                        eventBus.emit(GameEventType.SET_CAMERA_TARGET, { x: 0, y: 14, z: 6 });
                    }
                } else {
                    entityManager.showEnemyBoard();
                    if (!engine.hasManualMovement) {
                        eventBus.emit(GameEventType.SET_CAMERA_TARGET, { x: 5, y: 10, z: 14 });
                    }
                }
            }
        });

        // --- Unified Save & Restore Logic ---
        const performSave = (slotId: number | 'session') => {
            if (!gameLoop.match) return;

            const isEnemyBoardShowing = entityManager.boardOrientation === 'enemy';
            const vs: ViewState = {
                camera: `${engine.camera.position.x.toFixed(4)}, ${engine.camera.position.y.toFixed(4)}, ${engine.camera.position.z.toFixed(4)}`,
                target: `${engine.orbitControls.target.x.toFixed(4)}, ${engine.orbitControls.target.y.toFixed(4)}, ${engine.orbitControls.target.z.toFixed(4)}`,
                cameraDist: parseFloat(engine.orbitControls.getDistance().toFixed(4)),
                boardOrientation: isEnemyBoardShowing ? 'enemy' : 'player',
                isDayMode: Config.visual.isDayMode,
                gameSpeedMultiplier: Config.timing.gameSpeedMultiplier,
                gameState: gameLoop.currentState
            };

            //console.log(`%c💾 Saving View State [${slotId}]`, 'color: #00ff00; font-weight: bold;', vs);

            eventBus.emit(GameEventType.SAVE_GAME, { 
                slotId, 
                viewState: vs,
                activeRogueShipIndex: gameLoop.activeRogueShipIndex,
                activeEnemyRogueShipIndex: gameLoop.activeEnemyRogueShipIndex
            });
        };

        eventBus.on(GameEventType.REQUEST_AUTO_SAVE, () => {
            performSave('session');
        });

        eventBus.on(GameEventType.SAVE_GAME, (payload) => {
            if (!payload?.viewState && payload?.slotId && (payload.slotId as any) !== 'session') {
                performSave(payload.slotId);
            }
        });

        eventBus.on(GameEventType.RESET_CAMERA, () => {
            engine.restoreViewState(5.0233, 10.0466, 14.0652, 0, 0, 0, 18);
        });
        
        eventBus.on(GameEventType.RESTORE_VIEW_STATE, (vs: any) => {
            // console.log(`%c🔄 Restoring View State [Source: ${vs?.source || 'Unknown'}]`, 'color: #00ffff; font-weight: bold;', vs);
            
            const defPos = { x: 5.0233, y: 10.0466, z: 14.0652 };
            const defTgt = { x: 0, y: 0, z: 0 };
            const defDist = 18;

            const parseCoord = (s: string | undefined) => s ? s.split(',').map(v => parseFloat(v.trim())) : null;
            const camCoords = parseCoord(vs?.camera);
            const tgtCoords = parseCoord(vs?.target);

            const camX = camCoords?.[0] ?? defPos.x;
            const camY = camCoords?.[1] ?? defPos.y;
            const camZ = camCoords?.[2] ?? defPos.z;
            const tgtX = tgtCoords?.[0] ?? defTgt.x;
            const tgtY = tgtCoords?.[1] ?? defTgt.y;
            const tgtZ = tgtCoords?.[2] ?? defTgt.z;
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
            eventBus.emit(GameEventType.TOGGLE_DAY_NIGHT, undefined as any);

            const speed = vs?.gameSpeedMultiplier ?? Config.timing.gameSpeedMultiplier;
            Config.timing.gameSpeedMultiplier = speed;
            eventBus.emit(GameEventType.SET_GAME_SPEED, { speed });
        });

        eventBus.on(GameEventType.TOGGLE_PEEK, (payload) => {
            const peeking = payload?.peeking;
            const currentState = gameLoop.currentState;
            if (peeking) {
                if (currentState === GameState.PLAYER_TURN) entityManager.showPlayerBoard();
                else entityManager.showEnemyBoard();
                eventBus.emit(GameEventType.SET_INTERACTION_ENABLED, { enabled: false });
            } else {
                if (currentState === GameState.PLAYER_TURN) entityManager.showEnemyBoard();
                else entityManager.showPlayerBoard();
                eventBus.emit(GameEventType.SET_INTERACTION_ENABLED, { enabled: true });
            }
        });

        eventBus.on(GameEventType.TURN_CHANGED, () => {
            entityManager.onTurnChange();
        });

        let isQuitting = false;
        eventBus.on(GameEventType.EXIT_GAME, () => {
            isQuitting = true;
        });

        // --- Global DOM Event Emitters ---
        window.addEventListener('resize', () => {
            eventBus.emit(GameEventType.WINDOW_RESIZE, { 
                width: window.innerWidth, 
                height: window.innerHeight 
            });
        });

        document.addEventListener('keydown', (e) => {
            eventBus.emit(GameEventType.DOCUMENT_KEYDOWN, e);
        });

        document.addEventListener('click', (e) => {
            eventBus.emit(GameEventType.DOCUMENT_CLICK, e);
        });

        // --- Global Interaction & Audio Resume ---
        const handleFirstInteraction = () => {
            eventBus.emit(GameEventType.GLOBAL_INTERACTION, undefined as any);
            window.removeEventListener('mousedown', handleFirstInteraction);
            window.removeEventListener('keydown', handleFirstInteraction);
        };
        window.addEventListener('mousedown', handleFirstInteraction);
        window.addEventListener('keydown', handleFirstInteraction);

        eventBus.on(GameEventType.GLOBAL_INTERACTION, () => {
            AudioEngine.getInstance().resume();
        });

        window.addEventListener('beforeunload', () => {
            if (!isQuitting && gameLoop.match && gameLoop.hasUnsavedProgress()) {
                const isEnemyBoardShowing = entityManager.boardOrientation === 'enemy';
                const vs: ViewState = {
                    camera: `${engine.camera.position.x.toFixed(4)}, ${engine.camera.position.y.toFixed(4)}, ${engine.camera.position.z.toFixed(4)}`,
                    target: `${engine.orbitControls.target.x.toFixed(4)}, ${engine.orbitControls.target.y.toFixed(4)}, ${engine.orbitControls.target.z.toFixed(4)}`,
                    cameraDist: engine.orbitControls.getDistance(),
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

        gameRunner = new GameRunner(
            engine,
            entityManager,
            interactionManager,
            gameLoop,
            uiManager
        );

        gameRunner.start();
        console.log(`[${new Date().toISOString()}] App: Running.`);
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
