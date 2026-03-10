import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';

export class HUD extends BaseUIComponent {
    private gameLoop: GameLoop;
    private turnIndicator!: HTMLElement;
    private playerFleetStatus!: HTMLElement;
    private enemyFleetStatus!: HTMLElement;

    constructor(gameLoop: GameLoop) {
        super('hud');
        this.gameLoop = gameLoop;
        
        // Listen to game loop state changes
        this.gameLoop.onStateChange((newState, _oldState) => {
            this.update(newState);
        });
    }

    protected render(): void {
        this.container.innerHTML = `
            <div class="hud-top-bar">
                <div id="player-status" class="hud-fleet-status">
                    <span>Player Fleet</span>
                    <span id="player-ships">Ships: ?/?</span>
                </div>
                
                <div id="turn-indicator" class="hud-turn-indicator">
                    WAITING...
                </div>

                <div id="enemy-status" class="hud-fleet-status">
                    <span>Enemy Fleet</span>
                    <span id="enemy-ships">Ships: ?/?</span>
                </div>
            </div>
            
            <div style="position: absolute; bottom: 20px; right: 20px;">
                <button id="hud-btn-settings" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">Options</button>
            </div>
        `;

        this.turnIndicator = this.container.querySelector('#turn-indicator') as HTMLElement;
        this.playerFleetStatus = this.container.querySelector('#player-ships') as HTMLElement;
        this.enemyFleetStatus = this.container.querySelector('#enemy-ships') as HTMLElement;
        
        const settingsBtn = this.container.querySelector('#hud-btn-settings') as HTMLButtonElement;
        settingsBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('SHOW_SETTINGS'));
        });
    }
    
    public update(state: GameState): void {
        if (state === GameState.PLAYER_TURN) {
            this.turnIndicator.innerText = "YOUR TURN";
            this.turnIndicator.style.color = "var(--color-secondary)";
        } else if (state === GameState.ENEMY_TURN) {
            this.turnIndicator.innerText = "ENEMY TURN";
            this.turnIndicator.style.color = "var(--color-danger)";
        } else if (state === GameState.SETUP_BOARD) {
            this.turnIndicator.innerText = "PLACE YOUR SHIPS";
            this.turnIndicator.style.color = "var(--color-primary)";
        } else if (state === GameState.GAME_OVER) {
            const matchStatus = this.gameLoop.match?.checkGameEnd();
            this.turnIndicator.innerText = matchStatus === 'player_wins' ? "VICTORY!" : "DEFEAT!";
        }
        
        // Update Fleet remaining ships (stub logic for now)
        if (this.gameLoop.match) {
            // In a real implementation we would interrogate the match.playerBoard.getRemainingShips()
            this.playerFleetStatus.innerText = "Ships Alive: TBD";
            this.enemyFleetStatus.innerText = "Ships Alive: TBD";
        }
    }
}
