import { GameLoop, GameState } from '../../application/game-loop/GameLoop';
import { MainMenu } from './menu/MainMenu';
import { HUD } from './hud/HUD';
import { PauseMenu } from './pause/PauseMenu';
import { Settings } from './settings/Settings';
import { GameOver } from './menu/GameOver';
import { SaveLoadDialog } from './components/SaveLoadDialog';
import { Storage } from '../../infrastructure/storage/Storage';

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
        
        // Find the designated UI layer from index.html
        const layer = document.getElementById('ui-layer');
        if (!layer) {
            throw new Error("UI Layer (#ui-layer) not found in DOM");
        }
        this.uiLayer = layer;

        // Instantiate components
        this.mainMenu = new MainMenu(this.gameLoop);
        this.hud = new HUD(this.gameLoop);
        this.pauseMenu = new PauseMenu(this.gameLoop);
        this.settings = new Settings(this.gameLoop);
        this.gameOver = new GameOver();
        this.saveLoadDialog = new SaveLoadDialog();

        // Mount components to the UI wrapper
        this.mainMenu.mount(this.uiLayer);
        this.hud.mount(this.uiLayer);
        this.pauseMenu.mount(this.uiLayer);
        this.settings.mount(this.uiLayer);
        this.gameOver.mount(this.uiLayer);
        this.saveLoadDialog.mount(this.uiLayer);

        // Listen for internal game state to show/hide menus
        this.gameLoop.onStateChange((newState: GameState) => {
            this.handleStateChange(newState);
        });

        // Global Event listeners for UI interaction coming from other components
        document.addEventListener('SHOW_PAUSE_MENU', () => {
            this.pauseMenu.show();
        });

        document.addEventListener('SHOW_SETTINGS', () => {
            this.settings.show();
        });

        document.addEventListener('TOGGLE_HUD', (e: any) => {
            if (e.detail?.show) {
                // If game is active, show HUD. We shouldn't show it if in main menu.
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
        });

        // Initialize display based on current loop state
        this.handleStateChange(this.gameLoop.currentState);

        // Check for auto-load from sessionStorage (set when user loads a game)
        this.checkAutoLoad();
    }

    private checkAutoLoad(): void {
        const autoloadSlot = sessionStorage.getItem('battleships_autoload');
        if (autoloadSlot) {
            sessionStorage.removeItem('battleships_autoload');
            const slotId = parseInt(autoloadSlot);
            const loaded = Storage.loadGame(slotId);
            if (loaded) {
                console.log(`Auto-loading game from slot ${slotId}`);
                this.gameLoop.loadMatch(loaded.match, loaded.viewState);
                // Fire event so main.ts can restore camera and visual state
                if (loaded.viewState) {
                    document.dispatchEvent(new CustomEvent('RESTORE_VIEW_STATE', { detail: loaded.viewState }));
                }
            }
        }
    }
    
    private handleStateChange(newState: GameState) {
        // Reset all visibility
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
            // Note: If coming from main menu to setup board, enable interaction. Settings handles its own toggle via onShow/onHide.
            if (!this.pauseMenu['isVisible'] && !this.settings['isVisible']) {
                document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
            }
        }
    }
}
