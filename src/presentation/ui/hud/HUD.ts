import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { Config } from '../../../infrastructure/config/Config';

export class HUD extends BaseUIComponent {
    private gameLoop: GameLoop;
    private turnIndicator!: HTMLElement;
    private playerFleetStatus!: HTMLElement;
    private enemyFleetStatus!: HTMLElement;
    private fpsCounter!: HTMLElement;

    constructor(gameLoop: GameLoop) {
        super('hud');
        this.gameLoop = gameLoop;
        
        // Listen to game loop state changes
        this.gameLoop.onStateChange((newState, _oldState) => {
            this.update(newState);
        });

        // Listen for attack results to update ship counts immediately
        this.gameLoop.onAttackResult((_x, _z, result, isPlayer) => {
            if (result === 'sunk') {
                this.updateCounters();
                
                // If isPlayer is true, the player fired the shot, so the enemy board was hit
                const targetElement = isPlayer ? this.enemyFleetStatus : this.playerFleetStatus;
                
                // Trigger CSS explosion animation
                targetElement.classList.remove('hud-explosion-anim');
                void targetElement.offsetWidth; // Trigger reflow
                targetElement.classList.add('hud-explosion-anim');
                
                setTimeout(() => {
                    targetElement.classList.remove('hud-explosion-anim');
                }, 500);
            }
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
                <button id="hud-btn-view-toggle" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">3D View</button>
                <button id="hud-btn-day-night" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">${Config.visual.isDayMode ? '☀️' : '🌙'}</button>
                <button id="hud-btn-speed" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">Speed: ${Config.timing.gameSpeedMultiplier}x</button>
                <button id="hud-btn-settings" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">Options</button>
            </div>
            
            <div id="fps-counter" style="position: absolute; top: 10px; right: 10px; color: #00ff00; font-family: monospace; font-size: 1.2rem; font-weight: bold; text-shadow: 1px 1px 2px #000; display: ${Config.visual.showFpsCounter ? 'block' : 'none'}; z-index: 1000; pointer-events: none;">
                FPS: 60
            </div>
        `;

        this.turnIndicator = this.container.querySelector('#turn-indicator') as HTMLElement;
        this.playerFleetStatus = this.container.querySelector('#player-ships') as HTMLElement;
        this.enemyFleetStatus = this.container.querySelector('#enemy-ships') as HTMLElement;
        this.fpsCounter = this.container.querySelector('#fps-counter') as HTMLElement;
        
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

        const dayNightBtn = this.container.querySelector('#hud-btn-day-night') as HTMLButtonElement;
        dayNightBtn.addEventListener('click', () => {
            Config.visual.isDayMode = !Config.visual.isDayMode;
            dayNightBtn.innerText = Config.visual.isDayMode ? '☀️' : '🌙';
            document.dispatchEvent(new CustomEvent('TOGGLE_DAY_NIGHT', { detail: { isDay: Config.visual.isDayMode } }));
        });
        
        const viewToggleBtn = this.container.querySelector('#hud-btn-view-toggle') as HTMLButtonElement;
        let is2D = false;
        viewToggleBtn.addEventListener('click', () => {
            is2D = !is2D;
            viewToggleBtn.innerText = is2D ? '2D View' : '3D View';
            document.dispatchEvent(new CustomEvent('TOGGLE_CAMERA_VIEW'));
        });
        
        document.addEventListener('UPDATE_FPS', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.fps !== undefined) {
                this.fpsCounter.innerText = `FPS: ${customEvent.detail.fps}`;
            }
        });
        
        document.addEventListener('TOGGLE_FPS_COUNTER', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.show !== undefined) {
                this.fpsCounter.style.display = customEvent.detail.show ? 'block' : 'none';
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
            this.turnIndicator.innerHTML = "PLACE YOUR SHIPS<br><span style='font-size:1.2rem;color:#bbb;'>Press 'R' to Rotate</span>";
            this.turnIndicator.style.color = "var(--color-primary)";
        } else if (state === GameState.GAME_OVER) {
            const matchStatus = this.gameLoop.match?.checkGameEnd();
            this.turnIndicator.innerText = matchStatus === 'player_wins' ? "VICTORY!" : "DEFEAT!";
        }
        
        // Update Fleet remaining ships
        this.updateCounters();
    }
    
    private updateCounters(): void {
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
