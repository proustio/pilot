import { GameLoop, GameState } from '../../application/game-loop/GameLoop';
import { MainMenu } from './menu/MainMenu';
import { HUD } from './hud/HUD';
import { Settings } from './settings/Settings';
import { GameOver } from './menu/GameOver';

export class UIManager {
    private gameLoop: GameLoop;
    private uiLayer: HTMLElement;
    
    private mainMenu: MainMenu;
    private hud: HUD;
    private settings: Settings;
    private gameOver: GameOver;

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
        this.settings = new Settings();
        this.gameOver = new GameOver(this.gameLoop);

        // Mount components to the UI wrapper
        this.mainMenu.mount(this.uiLayer);
        this.hud.mount(this.uiLayer);
        this.settings.mount(this.uiLayer);
        this.gameOver.mount(this.uiLayer);

        // Listen for internal game state to show/hide menus
        this.gameLoop.onStateChange((newState: GameState) => {
            this.handleStateChange(newState);
        });

        // Global Event listeners for UI interaction coming from other components
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

        // Initialize display based on current loop state
        this.handleStateChange(this.gameLoop.currentState);
    }
    
    private handleStateChange(newState: GameState) {
        // Reset all visibility
        this.mainMenu.hide();
        this.hud.hide();
        this.gameOver.hide();

        if (newState === GameState.MAIN_MENU) {
            this.mainMenu.show();
        } else if (newState === GameState.GAME_OVER) {
            this.gameOver.show();
            const status = this.gameLoop.match?.checkGameEnd() || 'enemy_wins';
            this.gameOver.updateMessage(status);
        } else {
            this.hud.show();
        }
    }
}
