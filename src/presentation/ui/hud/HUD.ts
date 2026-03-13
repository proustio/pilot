import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { Config } from '../../../infrastructure/config/Config';
import { UnifiedBoardUI } from './UnifiedBoardUI';

export class HUD extends BaseUIComponent {
    private gameLoop: GameLoop;
    private turnIndicator!: HTMLElement;
    private playerFleetIcons!: HTMLElement;
    private enemyFleetIcons!: HTMLElement;
    private geekStats!: HTMLElement;
    private unifiedBoard!: UnifiedBoardUI;

    constructor(gameLoop: GameLoop) {
        super('hud');
        this.gameLoop = gameLoop;
        
        // Listen to game loop state changes
        this.gameLoop.onStateChange((newState, _oldState) => {
            this.update(newState);
        });

        // Listen for attack results to update ship counts immediately
        this.gameLoop.onAttackResult((_x, _z, result, isPlayer, _isReplay) => {
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
                <button id="hud-btn-geek-stats" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;" title="Toggle Geek Stats">📈</button>
                <button id="hud-btn-auto-battler" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;" title="Toggle Auto-Battler">🤖</button>
                <button id="hud-btn-peek" class="voxel-btn ui-interactive" style="width: auto; padding: 10px; display: ${Config.visual.peekEnabled ? 'inline-block' : 'none'};" title="Peek at other side">👁️</button>
                <button id="hud-btn-day-night" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;" title="Toggle Day/Night">${Config.visual.isDayMode ? '🌞' : '🌚'}</button>
                <button id="hud-btn-speed" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;" title="Cycle Speed">${this.getSpeedLabel(Config.timing.gameSpeedMultiplier)}</button>
                <button id="hud-btn-settings" class="voxel-btn ui-interactive" style="width: auto; padding: 10px;" title="Pause Menu">⏸️</button>
            </div>
            
            <div id="geek-stats" class="geek-stats-panel" style="display: ${Config.visual.showGeekStats ? 'block' : 'none'};">
                <div class="geek-stats-title">⚙ GEEK STATS</div>
                <div class="geek-stats-row"><span class="gs-label">FPS</span><span class="gs-value" id="gs-fps">--</span></div>
                <div class="geek-stats-row"><span class="gs-label">FRAME</span><span class="gs-value" id="gs-frame">-- ms</span></div>
                <div class="geek-stats-row"><span class="gs-label">RAM</span><span class="gs-value" id="gs-ram">N/A</span></div>
                <div class="geek-stats-row"><span class="gs-label">STATUS</span><span class="gs-value gs-online" id="gs-status">● LOCAL</span></div>
                <div class="geek-stats-row"><span class="gs-label">TIME</span><span class="gs-value" id="gs-time">00:00</span></div>
            </div>

            <div id="mouse-coords" class="mouse-coords" style="display: none;">(0,0)</div>
        `;

        this.turnIndicator = this.container.querySelector('#turn-indicator') as HTMLElement;
        this.playerFleetIcons = this.container.querySelector('#player-fleet-icons') as HTMLElement;
        this.enemyFleetIcons = this.container.querySelector('#enemy-fleet-icons') as HTMLElement;
        this.geekStats = this.container.querySelector('#geek-stats') as HTMLElement;
        
        this.updateStats();
        
        const settingsBtn = this.container.querySelector('#hud-btn-settings') as HTMLButtonElement;
        settingsBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('SHOW_PAUSE_MENU'));
        });

        // Peek toggle button
        const peekBtn = this.container.querySelector('#hud-btn-peek') as HTMLButtonElement;
        let isPeeking = false;
        peekBtn.addEventListener('click', () => {
            isPeeking = !isPeeking;
            peekBtn.style.opacity = isPeeking ? '0.6' : '1';
            peekBtn.style.boxShadow = isPeeking ? 'inset 0 0 10px rgba(255,255,0,0.4)' : '';
            document.dispatchEvent(new CustomEvent('TOGGLE_PEEK', { detail: { peeking: isPeeking } }));
        });

        // Geek Stats button
        const geekStatsBtn = this.container.querySelector('#hud-btn-geek-stats') as HTMLButtonElement;
        geekStatsBtn.style.opacity = Config.visual.showGeekStats ? '1' : '0.6';
        geekStatsBtn.style.boxShadow = Config.visual.showGeekStats ? 'inset 0 0 10px rgba(255,255,255,0.8)' : '';
        geekStatsBtn.addEventListener('click', () => {
            Config.visual.showGeekStats = !Config.visual.showGeekStats;
            geekStatsBtn.style.opacity = Config.visual.showGeekStats ? '1' : '0.6';
            geekStatsBtn.style.boxShadow = Config.visual.showGeekStats ? 'inset 0 0 10px rgba(255,255,255,0.8)' : '';
            document.dispatchEvent(new CustomEvent('TOGGLE_GEEK_STATS', { detail: { show: Config.visual.showGeekStats } }));
        });

        // Auto-Battler button
        const autoBattlerBtn = this.container.querySelector('#hud-btn-auto-battler') as HTMLButtonElement;
        autoBattlerBtn.style.opacity = Config.autoBattler ? '1' : '0.6';
        autoBattlerBtn.style.boxShadow = Config.autoBattler ? 'inset 0 0 10px rgba(255,102,102,0.8)' : '';
        autoBattlerBtn.addEventListener('click', () => {
            Config.autoBattler = !Config.autoBattler;
            autoBattlerBtn.style.opacity = Config.autoBattler ? '1' : '0.6';
            autoBattlerBtn.style.boxShadow = Config.autoBattler ? 'inset 0 0 10px rgba(255,102,102,0.8)' : '';
            document.dispatchEvent(new CustomEvent('TOGGLE_AUTO_BATTLER', { detail: { enabled: Config.autoBattler } }));
        });

        // Listen for peek enabled/disabled from settings
        document.addEventListener('PEEK_ENABLED_CHANGED', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.enabled !== undefined) {
                peekBtn.style.display = ce.detail.enabled ? 'inline-block' : 'none';
                // If peek was active and feature gets disabled, stop peeking
                if (!ce.detail.enabled && isPeeking) {
                    isPeeking = false;
                    peekBtn.style.opacity = '1';
                    peekBtn.style.boxShadow = '';
                    document.dispatchEvent(new CustomEvent('TOGGLE_PEEK', { detail: { peeking: false } }));
                }
            }
        });

        const speedBtn = this.container.querySelector('#hud-btn-speed') as HTMLButtonElement;
        const speedCycle = [0.5, 1.0, 2.0, 4.0];
        speedBtn.addEventListener('click', () => {
            let currentIndex = speedCycle.indexOf(Config.timing.gameSpeedMultiplier);
            if (currentIndex === -1) currentIndex = 1; // Default to 1.0x if somehow out of bounds
            
            const nextIndex = (currentIndex + 1) % speedCycle.length;
            const nextSpeed = speedCycle[nextIndex];
            
            Config.timing.gameSpeedMultiplier = nextSpeed;
            speedBtn.innerText = this.getSpeedLabel(nextSpeed);
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed: nextSpeed.toFixed(1) } }));
        });
        
        // Listen for internal speed changes triggered from Settings Modal
        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.speed) {
                const speed = parseFloat(customEvent.detail.speed);
                speedBtn.innerText = this.getSpeedLabel(speed);
            }
        });

        const dayNightBtn = this.container.querySelector('#hud-btn-day-night') as HTMLButtonElement;
        dayNightBtn.addEventListener('click', () => {
            Config.visual.isDayMode = !Config.visual.isDayMode;
            dayNightBtn.innerText = Config.visual.isDayMode ? '🌞' : '🌚';
            document.body.classList.remove('day-mode', 'night-mode');
            document.body.classList.add(Config.visual.isDayMode ? 'day-mode' : 'night-mode');
            document.dispatchEvent(new CustomEvent('TOGGLE_DAY_NIGHT', { detail: { isDay: Config.visual.isDayMode } }));
        });
        

        document.addEventListener('UPDATE_GEEK_STATS', (e: Event) => {
            const customEvent = e as CustomEvent;
            const d = customEvent.detail;
            if (!d) return;

            const fpsEl = this.container.querySelector('#gs-fps');
            const frameEl = this.container.querySelector('#gs-frame');
            const ramEl = this.container.querySelector('#gs-ram');
            const timeEl = this.container.querySelector('#gs-time');

            if (fpsEl) fpsEl.textContent = `${d.fps}`;
            if (frameEl) frameEl.textContent = `${d.frameTime.toFixed(1)} ms`;

            // RAM — Chrome-only API
            if (ramEl) {
                const mem = (performance as any).memory;
                if (mem) {
                    const usedMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
                    ramEl.textContent = `${usedMB} MB`;
                }
            }

            // Elapsed game time
            if (timeEl && d.matchStartTime) {
                const elapsed = Math.floor((performance.now() - d.matchStartTime) / 1000);
                const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const secs = String(elapsed % 60).padStart(2, '0');
                timeEl.textContent = `${mins}:${secs}`;
            }
        });
        
        document.addEventListener('TOGGLE_GEEK_STATS', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.show !== undefined) {
                this.geekStats.style.display = customEvent.detail.show ? 'block' : 'none';
            }
        });

        const mouseCoordsEl = this.container.querySelector('#mouse-coords') as HTMLElement;
        document.addEventListener('MOUSE_CELL_HOVER', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail) {
                const { x, z, clientX, clientY } = ce.detail;
                mouseCoordsEl.textContent = `(${x},${z})`;
                mouseCoordsEl.style.left = `${clientX}px`;
                mouseCoordsEl.style.top = `${clientY}px`;
                mouseCoordsEl.style.display = 'block';
            } else {
                mouseCoordsEl.style.display = 'none';
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

    private getSpeedLabel(speed: number): string {
        const emoji = speed === 0.5 ? '⏯️' : speed === 2.0 ? '⏩' : speed === 4.0 ? '⏫' : '▶️';
        return `${speed}x ${emoji}`;
    }
}
