import { GameLoop, GameState } from '../../application/game-loop/GameLoop';
import { Match } from '../../domain/match/Match';
import { InteractivityGuard } from '../InteractivityGuard';
import { MainMenu } from './menu/MainMenu';
import { HUD } from './hud/HUD';
import { PauseMenu } from './pause/PauseMenu';
import { Settings } from './settings/Settings';
import { GameOver } from './menu/GameOver';
import { SaveLoadDialog } from './components/SaveLoadDialog';
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

    constructor(gameLoop: GameLoop) {
        this.gameLoop = gameLoop;
        
        const layer = document.getElementById('ui-layer');
        if (!layer) {
            throw new Error("UI Layer (#ui-layer) not found in DOM");
        }
        this.uiLayer = layer;

        this.mainMenu = new MainMenu(this.gameLoop);
        this.hud = new HUD(this.gameLoop);
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

        document.addEventListener('SHOW_PAUSE_MENU', () => {
            this.pauseMenu.show();
        });

        document.addEventListener('SHOW_SETTINGS', () => {
            this.settings.show();
            InteractivityGuard.setMenuOpen(true);
        });

        document.addEventListener('TOGGLE_HUD', (e: any) => {
            if (e.detail?.show) {
                if (this.gameLoop.currentState !== GameState.MAIN_MENU) {
                    this.hud.show();
                }
            } else {
                this.hud.hide();
            }
        });

        document.addEventListener('SHOW_SAVE_DIALOG', () => {
            this.saveLoadDialog.openAs('save');
        });

        document.addEventListener('SHOW_LOAD_DIALOG', () => {
            this.saveLoadDialog.openAs('load');
            InteractivityGuard.setMenuOpen(true);
        });

        this.handleStateChange(this.gameLoop.currentState);

        document.addEventListener('keydown', (e: KeyboardEvent) => {
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
        });


        this.checkAutoLoad();

        // Global UI sound effect listener
        document.addEventListener('click', (e: MouseEvent) => {
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
        });
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
                this.gameLoop.loadMatch(loaded.match);
                if (loaded.viewState) {
                    document.dispatchEvent(new CustomEvent('RESTORE_VIEW_STATE', { detail: loaded.viewState }));
                }
            }
        } else {
            const sessionLoaded = Storage.loadGame('session');
            if (sessionLoaded) {
                console.log(`Resuming previous session`);
                this.gameLoop.loadMatch(sessionLoaded.match);
                if (sessionLoaded.viewState) {
                    document.dispatchEvent(new CustomEvent('RESTORE_VIEW_STATE', { detail: sessionLoaded.viewState }));
                }
            }
        }
    }
    
    private handleStateChange(newState: GameState) {
        this.mainMenu.hide();
        this.hud.hide();
        this.gameOver.hide();

        if (newState === GameState.MAIN_MENU) {
            this.mainMenu.show();
            document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
        } else if (newState === GameState.GAME_OVER) {
            this.gameOver.show();
            const status = this.gameLoop.match?.checkGameEnd() || 'enemy_wins';
            this.gameOver.updateMessage(status);
            document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
        } else {
            this.hud.show();
            if (!this.pauseMenu['isVisible'] && !this.settings['isVisible']) {
                document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
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
    }
}
