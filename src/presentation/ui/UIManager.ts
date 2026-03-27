import { GameLoop, GameState } from '../../application/game-loop/GameLoop';
import { Match } from '../../domain/match/Match';
import { InteractivityGuard } from '../InteractivityGuard';
import { MainMenu } from './menu/MainMenu';
import { HUD } from './hud/HUD';
import { PauseMenu } from './pause/PauseMenu';
import { Settings } from './settings/Settings';
import { GameOver } from './menu/GameOver';
import { SaveLoadDialog } from './components/SaveLoadDialog';
import { eventBus, GameEventType } from '../../application/events/GameEventBus';
import { Storage } from '../../infrastructure/storage/Storage';
import { AudioEngine } from '../../infrastructure/audio/AudioEngine';


export class UIManager {
    private gameLoop: GameLoop;
    private uiLayer: HTMLElement;
    
    private mainMenu: MainMenu;
    private hud: HUD;
    private pauseMenu: PauseMenu;
    private settings: Settings;
    private gameOver: GameOver;
    private saveLoadDialog: SaveLoadDialog;
    private entityManager: any; // Quick type or import EntityManager

    constructor(gameLoop: GameLoop, entityManager: any) {
        this.gameLoop = gameLoop;
        this.entityManager = entityManager;
        
        const layer = document.getElementById('ui-layer');
        if (!layer) {
            throw new Error("UI Layer (#ui-layer) not found in DOM");
        }
        this.uiLayer = layer;

        this.mainMenu = new MainMenu(this.gameLoop);
        this.hud = new HUD(this.gameLoop, this.entityManager);
        this.pauseMenu = new PauseMenu(this.gameLoop);
        this.settings = new Settings(this.gameLoop);
        this.gameOver = new GameOver();
        this.saveLoadDialog = new SaveLoadDialog();

        this.mainMenu.mount(this.uiLayer);
        this.hud.mount(this.uiLayer);
        this.pauseMenu.mount(this.uiLayer);
        this.settings.mount(this.uiLayer);
        this.gameOver.mount(this.uiLayer);
        this.saveLoadDialog.mount(this.uiLayer);

        this.gameLoop.onStateChange((newState: GameState) => {
            this.handleStateChange(newState);
        });

        eventBus.on(GameEventType.SHOW_PAUSE_MENU, () => this.pauseMenu.show());
        eventBus.on(GameEventType.SHOW_SAVE_DIALOG, () => this.saveLoadDialog.openAs('save'));
        eventBus.on(GameEventType.SHOW_LOAD_DIALOG, () => this.saveLoadDialog.openAs('load'));
        eventBus.on(GameEventType.SHOW_SETTINGS, () => this.settings.show());

        eventBus.on(GameEventType.TOGGLE_HUD, (payload) => {
            if (payload.show) this.hud.show();
            else this.hud.hide();
        });


        this.handleStateChange(this.gameLoop.currentState);

        eventBus.on(GameEventType.DOCUMENT_KEYDOWN, (e) => this.handleGlobalKeydown(e));
        eventBus.on(GameEventType.DOCUMENT_CLICK, (e) => this.handleGlobalClick(e));


        this.checkAutoLoad();

    }


    private checkAutoLoad(): void {
        const newMatchMode = sessionStorage.getItem('battleships_new_match_mode');
        if (newMatchMode) {
            sessionStorage.removeItem('battleships_new_match_mode');
            const matchMode = newMatchMode as any;
            const width = matchMode === 'rogue' ? 20 : 10;
            const height = matchMode === 'rogue' ? 20 : 10;
            const match = new Match(matchMode, width, height);
            this.gameLoop.startNewMatch(match);
            return;
        }

        const autoloadSlot = sessionStorage.getItem('battleships_autoload');
        if (autoloadSlot) {
            sessionStorage.removeItem('battleships_autoload');
            const slotId = parseInt(autoloadSlot);
            const loaded = Storage.loadGame(slotId);
            if (loaded) {
                console.log(`Auto-loading game from slot ${slotId}`);
                this.gameLoop.loadMatch(
                    loaded.match, 
                    loaded.resources, 
                    loaded.activeRogueShipIndex, 
                    loaded.activeEnemyRogueShipIndex
                );
                if (loaded.viewState) {
                    eventBus.emit(GameEventType.RESTORE_VIEW_STATE, { 
                        ...loaded.viewState, source: `Slot ${slotId}` 
                    });
                }
            }
        } else {
            const sessionLoaded = Storage.loadGame('session');
            if (sessionLoaded) {
                console.log(`Resuming previous session`);
                this.gameLoop.loadMatch(
                    sessionLoaded.match,
                    sessionLoaded.resources,
                    sessionLoaded.activeRogueShipIndex,
                    sessionLoaded.activeEnemyRogueShipIndex
                );
                if (sessionLoaded.viewState) {
                    eventBus.emit(GameEventType.RESTORE_VIEW_STATE, { 
                        ...sessionLoaded.viewState, source: 'Session' 
                    });
                }
            }
        }
    }

    private handleGlobalKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            if (this.gameLoop.currentState !== GameState.MAIN_MENU && this.gameLoop.currentState !== GameState.GAME_OVER) {
                if (this.pauseMenu['isVisible']) {
                    this.pauseMenu.hide();
                } else if (this.settings['isVisible']) {
                    this.settings.hide();
                } else {
                    this.pauseMenu.show();
                }
            }
        }
    }

    private handleGlobalClick(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        const button = target.closest('button');
        if (button) {
            // Generate a "unique" frequency based on button ID or text
            const seedString = button.id || button.innerText || 'default';
            let hash = 0;
            for (let i = 0; i < seedString.length; i++) {
                hash = ((hash << 5) - hash) + seedString.charCodeAt(i);
                hash |= 0;
            }
            const freq = 300 + (Math.abs(hash) % 300); // 300-600Hz
            AudioEngine.getInstance().playPop(freq);
        }
    }
    
    private handleStateChange(newState: GameState) {
        this.mainMenu.hide();
        this.hud.hide();
        this.gameOver.hide();

        if (newState === GameState.MAIN_MENU) {
            this.mainMenu.show();
            eventBus.emit(GameEventType.SET_INTERACTION_ENABLED, { enabled: false });
        } else if (newState === GameState.GAME_OVER) {
            this.gameOver.show();
            const status = this.gameLoop.match?.checkGameEnd() || 'enemy_wins';
            this.gameOver.updateMessage(status);
            eventBus.emit(GameEventType.SET_INTERACTION_ENABLED, { enabled: false });
        } else {
            this.hud.show();
            if (!this.pauseMenu['isVisible'] && !this.settings['isVisible']) {
                eventBus.emit(GameEventType.SET_INTERACTION_ENABLED, { enabled: true });
                InteractivityGuard.setMenuOpen(false);
            }
        }
    }

    public update() {
        // Sync animation state from GameLoop
        InteractivityGuard.setGameAnimating(this.gameLoop.isAnimating);
        
        // Sync menu state if any sub-menu is visible
        const isAnyMenuOpen = this.mainMenu['isVisible'] || 
                             this.pauseMenu['isVisible'] || 
                             this.settings['isVisible'] || 
                             this.gameOver['isVisible'] ||
                             this.saveLoadDialog['isVisible'];
        
        InteractivityGuard.setMenuOpen(isAnyMenuOpen);

        // Centralized Pause Management
        const isPausingMenuOpen = this.pauseMenu['isVisible'] || 
                                 this.settings['isVisible'] || 
                                 this.saveLoadDialog['isVisible'];
        
        const isMainMenu = this.gameLoop.currentState === GameState.MAIN_MENU;

        if (isPausingMenuOpen && !this.gameLoop.isPaused) {
            eventBus.emit(GameEventType.PAUSE_GAME, undefined as any);
        } else if (!isPausingMenuOpen && this.gameLoop.isPaused && !isMainMenu) {
            eventBus.emit(GameEventType.RESUME_GAME, undefined as any);
        }
    }
}
