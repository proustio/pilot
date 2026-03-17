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
            
            <div class="hud-bottom-bar">
                <div class="hud-controls-panel ui-interactive">
                    <div class="sw-screw tl"></div>
                    <div class="sw-screw tr"></div>
                    <div class="sw-screw bl"></div>
                    <div class="sw-screw br"></div>

                    <!-- Row 1: Primary Controls -->
                    <div class="sw-mount">
                        <div class="sw-label">STATS</div>
                        <div id="led-geek-stats" class="sw-led ${Config.visual.showGeekStats ? 'on-gold' : ''}"></div>
                        <div id="hud-btn-geek-stats" class="sw-toggle ${Config.visual.showGeekStats ? 'active' : ''}" title="Toggle Geek Stats"></div>
                    </div>

                    <div class="sw-mount">
                        <div class="sw-label">AUTO</div>
                        <div id="led-auto-battler" class="sw-led ${Config.autoBattler ? 'on-red' : ''}"></div>
                        <div id="hud-btn-auto-battler" class="sw-rocker ${Config.autoBattler ? 'active' : ''}" title="Toggle Auto-Battler"></div>
                    </div>

                    <div class="sw-mount">
                        <div class="sw-label">PEEK</div>
                        <div id="led-peek" class="sw-led"></div>
                        <div id="hud-btn-peek" class="sw-toggle" title="Peek at other side"></div>
                    </div>

                    <div class="sw-mount">
                        <div class="sw-label">MODE</div>
                        <div id="led-day-night" class="sw-led ${Config.visual.isDayMode ? 'on-gold' : 'on-blue'}"></div>
                        <button id="hud-btn-day-night" class="sw-push" title="Toggle Day/Night" style="font-size: 1.2rem;">${Config.visual.isDayMode ? '🌞' : '🌚'}</button>
                    </div>

                    <!-- Row 2: Settings & System -->
                    <div class="sw-mount">
                        <div class="sw-label">FPS</div>
                        <div class="sw-led on-green"></div>
                        <button id="hud-btn-fps" class="sw-push" title="Cycle FPS Cap" style="font-size: 0.7rem;">${Config.visual.fpsCap || 60}<br>FPS</button>
                    </div>

                    <div class="sw-mount">
                        <div class="sw-label">SPEED</div>
                        <div class="sw-led on-green"></div>
                        <button id="hud-btn-speed" class="sw-push" title="Cycle Speed" style="font-size: 0.8rem;">${Config.timing.gameSpeedMultiplier}X</button>
                    </div>

                    <div class="sw-mount" style="grid-column: span 2;">
                        <div class="sw-label">SYSTEM PAUSE</div>
                        <div class="sw-led on-red"></div>
                        <button id="hud-btn-settings" class="sw-push red" title="Pause Menu" style="width: 100px; border-radius: 4px;">PAUSE</button>
                    </div>
                </div>
            </div>
            
            <div id="geek-stats" class="geek-stats-panel" style="display: ${Config.visual.showGeekStats ? 'block' : 'none'};">
                <div class="geek-stats-title">⚙ GEEK STATS</div>
                <div class="geek-stats-row"><span class="gs-label">FPS</span><span class="gs-value" id="gs-fps">--</span></div>
                <div class="geek-stats-row"><span class="gs-label">FRAME</span><span class="gs-value" id="gs-frame">-- ms</span></div>
                <div class="geek-stats-row"><span class="gs-label">RAM</span><span class="gs-value" id="gs-ram">-- MB</span></div>
                <div class="geek-stats-row" title="Distance from camera target"><span class="gs-label">DIST</span><span class="gs-value" id="gs-zoom">--</span></div>
                <div class="geek-stats-row" title="Camera World Position"><span class="gs-label">POS</span><span class="gs-value" id="gs-pos">--</span></div>
                <div class="geek-stats-row" title="Camera Target Position"><span class="gs-label">TGT</span><span class="gs-value" id="gs-tgt">--</span></div>
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
        const peekBtn = this.container.querySelector('#hud-btn-peek') as HTMLElement;
        const peekLed = this.container.querySelector('#led-peek') as HTMLElement;
        let isPeeking = false;
        peekBtn.addEventListener('click', () => {
            isPeeking = !isPeeking;
            peekBtn.classList.toggle('active', isPeeking);
            peekLed.classList.toggle('on-blue', isPeeking);
            document.dispatchEvent(new CustomEvent('TOGGLE_PEEK', { detail: { peeking: isPeeking } }));
        });

        // Geek Stats button
        const geekStatsBtn = this.container.querySelector('#hud-btn-geek-stats') as HTMLElement;
        const geekStatsLed = this.container.querySelector('#led-geek-stats') as HTMLElement;
        geekStatsBtn.addEventListener('click', () => {
            Config.visual.showGeekStats = !Config.visual.showGeekStats;
            geekStatsBtn.classList.toggle('active', Config.visual.showGeekStats);
            geekStatsLed.classList.toggle('on-gold', Config.visual.showGeekStats);
            document.dispatchEvent(new CustomEvent('TOGGLE_GEEK_STATS', { detail: { show: Config.visual.showGeekStats } }));
        });

        // Auto-Battler button
        const autoBattlerBtn = this.container.querySelector('#hud-btn-auto-battler') as HTMLElement;
        const autoBattlerLed = this.container.querySelector('#led-auto-battler') as HTMLElement;
        autoBattlerBtn.addEventListener('click', () => {
            Config.autoBattler = !Config.autoBattler;
            autoBattlerBtn.classList.toggle('active', Config.autoBattler);
            autoBattlerLed.classList.toggle('on-red', Config.autoBattler);
            document.dispatchEvent(new CustomEvent('TOGGLE_AUTO_BATTLER', { detail: { enabled: Config.autoBattler } }));
        });

        document.addEventListener('PEEK_ENABLED_CHANGED', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.enabled !== undefined) {
                peekBtn.style.display = ce.detail.enabled ? 'inline-block' : 'none';
                if (!ce.detail.enabled && isPeeking) {
                    isPeeking = false;
                    peekBtn.classList.remove('active');
                    peekLed.classList.remove('on-blue');
                    document.dispatchEvent(new CustomEvent('TOGGLE_PEEK', { detail: { peeking: false } }));
                }
            }
        });

        const speedBtn = this.container.querySelector('#hud-btn-speed') as HTMLButtonElement;
        const speedCycle = [0.5, 1.0, 2.0, 4.0];
        speedBtn.addEventListener('click', () => {
            let currentIndex = speedCycle.indexOf(Config.timing.gameSpeedMultiplier);
            if (currentIndex === -1) currentIndex = 1;

            const nextIndex = (currentIndex + 1) % speedCycle.length;
            const nextSpeed = speedCycle[nextIndex];

            Config.timing.gameSpeedMultiplier = nextSpeed;
            Config.saveConfig();
            speedBtn.innerText = this.getSpeedLabel(nextSpeed).split(' ')[0]; // Just the number
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed: nextSpeed.toFixed(1) } }));
        });

        const fpsBtn = this.container.querySelector('#hud-btn-fps') as HTMLButtonElement;
        const fpsCycle = [30, 60, 120];
        fpsBtn.addEventListener('click', () => {
            let currentIndex = fpsCycle.indexOf(Config.visual.fpsCap);
            if (currentIndex === -1) currentIndex = 1; // default to 60

            const nextIndex = (currentIndex + 1) % fpsCycle.length;
            const nextFps = fpsCycle[nextIndex];

            Config.visual.fpsCap = nextFps;
            Config.saveConfig();
            fpsBtn.innerHTML = `${nextFps}<br>FPS`;
            document.dispatchEvent(new CustomEvent('SET_FPS_CAP', { detail: { fpsCap: nextFps } }));
        });

        document.addEventListener('SET_FPS_CAP', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.fpsCap) {
                fpsBtn.innerHTML = `${customEvent.detail.fpsCap}<br>FPS`;
            }
        });

        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.speed) {
                const speed = parseFloat(customEvent.detail.speed);
                speedBtn.innerText = `${speed}X`;
            }
        });

        const dayNightBtn = this.container.querySelector('#hud-btn-day-night') as HTMLButtonElement;
        const dayNightLed = this.container.querySelector('#led-day-night') as HTMLElement;
        dayNightBtn.addEventListener('click', () => {
            Config.visual.isDayMode = !Config.visual.isDayMode;
            Config.saveConfig();
            dayNightBtn.innerText = Config.visual.isDayMode ? '🌞' : '🌚';
            dayNightLed.classList.remove('on-gold', 'on-blue');
            dayNightLed.classList.add(Config.visual.isDayMode ? 'on-gold' : 'on-blue');
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
            const zoomEl = this.container.querySelector('#gs-zoom');
            const posEl = this.container.querySelector('#gs-pos');
            const tgtEl = this.container.querySelector('#gs-tgt');
            const timeEl = this.container.querySelector('#gs-time');

            if (fpsEl) fpsEl.textContent = `${d.fps}`;
            if (frameEl) frameEl.textContent = `${d.frameTime.toFixed(1)}ms`;

            if (ramEl) {
                const mem = (performance as any).memory;
                if (mem) {
                    const usedMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
                    ramEl.textContent = `${usedMB} MB`;
                }
            }

            if (zoomEl && d.zoom !== undefined) {
                zoomEl.textContent = `${d.zoom.toFixed(1)}`;
            }

            if (posEl && d.cameraPos) {
                posEl.textContent = `${d.cameraPos.x.toFixed(1)},${d.cameraPos.y.toFixed(1)},${d.cameraPos.z.toFixed(1)}`;
            }

            if (tgtEl && d.targetPos) {
                tgtEl.textContent = `${d.targetPos.x.toFixed(1)},${d.targetPos.y.toFixed(1)},${d.targetPos.z.toFixed(1)}`;
            }

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

        this.updateCounters();
    }

    private updateCounters(): void {
        if (this.gameLoop.match) {
            const renderIcons = (container: HTMLElement, ships: any[]) => {
                container.innerHTML = '';
                const sortedShips = [...ships].sort((a, b) => b.size - a.size);

                sortedShips.forEach(ship => {
                    const icon = document.createElement('div');
                    icon.classList.add('ship-icon');
                    if (ship.isSunk()) icon.classList.add('sunk');

                    for (let i = 0; i < ship.size; i++) {
                        const segment = document.createElement('div');
                        segment.classList.add('ship-segment');
                        
                        // Reflect individual segment hits
                        if (ship.segments[i] === false) {
                            segment.classList.add('hit');
                        }
                        
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
