import { GameLoop, GameState } from '../../application/game-loop/GameLoop';
import { MainMenu } from './menu/MainMenu';
import { HUD } from './hud/HUD';
import { Settings } from './settings/Settings';

export class UIManager {
    private gameLoop: GameLoop;
    private uiLayer: HTMLElement;
    
    private mainMenu: MainMenu;
    private hud: HUD;
    private settings: Settings;

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

        // Mount components to the UI wrapper
        this.mainMenu.mount(this.uiLayer);
        this.hud.mount(this.uiLayer);
        this.settings.mount(this.uiLayer);

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
        // Simple logic for visibility
        if (newState === GameState.MAIN_MENU) {
            this.mainMenu.show();
            this.hud.hide();
        } else {
            this.mainMenu.hide();
            this.hud.show();
        }
    }
}
