import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { Config } from '../../../infrastructure/config/Config';

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
            
            <div style="position: absolute; bottom: 20px; right: 20px; display: flex; gap: 10px;">
                <button id="hud-btn-speed" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">Speed: ${Config.timing.gameSpeedMultiplier}x</button>
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

        const speedBtn = this.container.querySelector('#hud-btn-speed') as HTMLButtonElement;
        const speedCycle = [0.5, 1.0, 2.0, 4.0];
        speedBtn.addEventListener('click', () => {
            let currentIndex = speedCycle.indexOf(Config.timing.gameSpeedMultiplier);
            if (currentIndex === -1) currentIndex = 1; // Default to 1.0x if somehow out of bounds
            
            const nextIndex = (currentIndex + 1) % speedCycle.length;
            const nextSpeed = speedCycle[nextIndex];
            
            Config.timing.gameSpeedMultiplier = nextSpeed;
            speedBtn.innerText = `Speed: ${nextSpeed}x`;
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed: nextSpeed.toString() } }));
        });
        
        // Listen for internal speed changes triggered from Settings Modal
        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.speed) {
                speedBtn.innerText = `Speed: ${customEvent.detail.speed}x`;
            }
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
        
        // Update Fleet remaining ships
        if (this.gameLoop.match) {
            const countAlive = (board: any) => board.ships.filter((s: any) => !s.isSunk()).length;
            
            const playerBoard = this.gameLoop.match.playerBoard;
            const enemyBoard = this.gameLoop.match.enemyBoard;
            
            const playerTotal = playerBoard.ships.length || this.gameLoop.match.getRequiredFleet().length;
            const enemyTotal = enemyBoard.ships.length || this.gameLoop.match.getRequiredFleet().length;
            
            this.playerFleetStatus.innerText = `Ships Alive: ${countAlive(playerBoard)}/${playerTotal}`;
            this.enemyFleetStatus.innerText = `Ships Alive: ${countAlive(enemyBoard)}/${enemyTotal}`;
        }
    }
}
