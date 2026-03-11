import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { Config } from '../../../infrastructure/config/Config';
import { UnifiedBoardUI } from './UnifiedBoardUI';

export class HUD extends BaseUIComponent {
    private gameLoop: GameLoop;
    private turnIndicator!: HTMLElement;
    private playerFleetIcons!: HTMLElement;
    private enemyFleetIcons!: HTMLElement;
    private fpsCounter!: HTMLElement;
    private unifiedBoard!: UnifiedBoardUI;

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
                const targetElement = isPlayer ? this.enemyFleetIcons : this.playerFleetIcons;
                
                // Trigger CSS explosion animation
                targetElement.classList.remove('hud-explosion-anim');
                void targetElement.offsetWidth; // Trigger reflow
                targetElement.classList.add('hud-explosion-anim');
                
                setTimeout(() => {
                    targetElement.classList.remove('hud-explosion-anim');
                }, 500);
            }
            this.updateStats();
        });

        this.unifiedBoard = new UnifiedBoardUI(this.gameLoop);
    }

    public mount(parentElement: HTMLElement): void {
        super.mount(parentElement);
        const anchor = this.container.querySelector('#unified-board-anchor') as HTMLElement;
        this.unifiedBoard.mount(anchor || this.container);
        this.unifiedBoard.show();
    }

    protected render(): void {
        this.container.innerHTML = `
            <div class="hud-top-bar">
                <div class="hud-top-left">
                    <div id="unified-board-anchor"></div>
                    <div id="game-stats" class="hud-game-stats">
                        <div class="stat-item">SHOTS: <span id="stat-shots">0</span></div>
                        <div class="stat-item">RATIO: <span id="stat-ratio">0%</span></div>
                    </div>
                </div>
                
                <div id="turn-indicator" class="hud-turn-indicator">
                    WAITING...
                </div>

                <div id="fleet-status-group" class="hud-fleet-status-group">
                    <div id="player-status" class="hud-fleet-status">
                        <span class="fleet-label">YOU</span>
                        <div id="player-fleet-icons" class="fleet-icons"></div>
                    </div>
                    <div id="enemy-status" class="hud-fleet-status">
                        <span class="fleet-label">ENEMY</span>
                        <div id="enemy-fleet-icons" class="fleet-icons"></div>
                    </div>
                </div>
            </div>
            
            <div style="position: absolute; bottom: 20px; right: 20px; display: flex; gap: 10px;">
                <button id="hud-btn-view-toggle" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">3D View</button>
                <button id="hud-btn-day-night" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">${Config.visual.isDayMode ? '☀️' : '🌙'}</button>
                <button id="hud-btn-speed" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">Speed: ${Config.timing.gameSpeedMultiplier}x</button>
                <button id="hud-btn-settings" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;">Pause</button>
            </div>
            
            <div id="fps-counter" style="position: absolute; top: 10px; right: 10px; color: #00ff00; font-family: monospace; font-size: 1.2rem; font-weight: bold; text-shadow: 1px 1px 2px #000; display: ${Config.visual.showFpsCounter ? 'block' : 'none'}; z-index: 1000; pointer-events: none;">
                FPS: 60
            </div>
        `;

        this.turnIndicator = this.container.querySelector('#turn-indicator') as HTMLElement;
        this.playerFleetIcons = this.container.querySelector('#player-fleet-icons') as HTMLElement;
        this.enemyFleetIcons = this.container.querySelector('#enemy-fleet-icons') as HTMLElement;
        this.fpsCounter = this.container.querySelector('#fps-counter') as HTMLElement;
        
        this.updateStats();
        
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
            const speedStr = nextSpeed.toFixed(1);
            speedBtn.innerText = `Speed: ${speedStr}x`;
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed: speedStr } }));
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
            const renderIcons = (container: HTMLElement, ships: any[]) => {
                container.innerHTML = '';
                // Sort ships by size descending
                const sortedShips = [...ships].sort((a, b) => b.size - a.size);
                
                sortedShips.forEach(ship => {
                    const icon = document.createElement('div');
                    icon.classList.add('ship-icon');
                    if (ship.isSunk()) icon.classList.add('sunk');
                    
                    for (let i = 0; i < ship.size; i++) {
                        const segment = document.createElement('div');
                        segment.classList.add('ship-segment');
                        icon.appendChild(segment);
                    }
                    container.appendChild(icon);
                });
            };
            
            renderIcons(this.playerFleetIcons, this.gameLoop.match.playerBoard.ships);
            renderIcons(this.enemyFleetIcons, this.gameLoop.match.enemyBoard.ships);
        }
    }

    private updateStats(): void {
        if (this.gameLoop.match) {
            const enemyBoard = this.gameLoop.match.enemyBoard;

            // Player attacks enemy board, so stats are on enemyBoard (shots fired at enemy)
            // Or total shots fired by both? The prompt says "shots fired, hit/miss ratio"
            // Usually this means the player's performance.
            const shots = enemyBoard.shotsFired;
            const hits = enemyBoard.hits;
            const ratio = shots > 0 ? Math.round((hits / shots) * 100) : 0;

            const shotsEl = this.container.querySelector('#stat-shots');
            const ratioEl = this.container.querySelector('#stat-ratio');

            if (shotsEl) shotsEl.textContent = shots.toString();
            if (ratioEl) ratioEl.textContent = `${ratio}%`;
        }
    }
}
