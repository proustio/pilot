import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { MatchMode } from '../../../domain/match/Match';
import { Config } from '../../../infrastructure/config/Config';
import { UnifiedBoardUI } from './UnifiedBoardUI';
import { bindHUDControls } from './HUDControls';
import { renderFleetIcons, updateGameStats } from './HUDStats';

/**
 * Main HUD component that orchestrates the top-bar (stats, turn, fleet)
 * and bottom-bar (switchboard controls).
 * 
 * Logic is decomposed into:
 * - HUDControls.ts (event binding & button logic)
 * - HUDStats.ts (stat calculation & fleet rendering)
 */
export class HUD extends BaseUIComponent {
    private gameLoop: GameLoop;
    private turnIndicator!: HTMLElement;
    private playerFleetIcons!: HTMLElement;
    private enemyFleetIcons!: HTMLElement;
    private unifiedBoard!: UnifiedBoardUI;
    private activeRogueShip: any = null;

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

                const targetElement = isPlayer ? this.enemyFleetIcons : this.playerFleetIcons;
                // Trigger CSS explosion animation
                targetElement.classList.remove('hud-explosion-anim');
                void targetElement.offsetWidth; // Trigger reflow
                targetElement.classList.add('hud-explosion-anim');
                setTimeout(() => targetElement.classList.remove('hud-explosion-anim'), 500);
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
                    <div id="unified-board-anchor" class="retro-panel">
                        <div class="sw-screw tl"></div><div class="sw-screw tr"></div>
                        <div class="sw-screw bl"></div><div class="sw-screw br"></div>
                    </div>
                    <div id="game-stats" class="hud-game-stats retro-panel ${Config.rogueMode ? 'hidden' : ''}">
                        <div class="sw-screw tl"></div><div class="sw-screw tr"></div>
                        <div class="sw-screw bl"></div><div class="sw-screw br"></div>
                        <div class="stat-item">SHOTS: <span id="stat-shots">0</span></div>
                        <div class="stat-item">RATIO: <span id="stat-ratio">0%</span></div>
                        <div class="stat-item win-prob-item">PROB: <span id="stat-prob">50%</span></div>
                    </div>

                    <div class="hud-arsenal-panel retro-panel ${Config.rogueMode ? '' : 'hidden'}" id="arsenal-panel">
                        <div class="sw-screw tl"></div><div class="sw-screw tr"></div>
                        <div class="sw-screw bl"></div><div class="sw-screw br"></div>
                        <div class="arsenal-title">SHIP SYSTEMS</div>
                        <div class="arsenal-items">
                            <button class="arsenal-btn active" data-weapon="cannon" title="Standard Cannon">💣</button>
                            <button class="arsenal-btn" data-weapon="mine" title="Place Mine">⚓</button>
                            <button class="arsenal-btn" data-weapon="sonar" title="Sonar Ping">📡</button>
                            <button class="arsenal-btn" data-weapon="airstrike" title="Air Strike">✈️</button>
                        </div>
                    </div>
                </div>
                
                <div id="turn-indicator" class="hud-turn-indicator">
                    <div class="sw-screw tl" style="transform: scale(0.7); top: 4px; left: 4px;"></div>
                    <div class="sw-screw tr" style="transform: scale(0.7); top: 4px; right: 4px;"></div>
                    <div class="sw-screw bl" style="transform: scale(0.7); bottom: 4px; left: 4px;"></div>
                    <div class="sw-screw br" style="transform: scale(0.7); bottom: 4px; right: 4px;"></div>
                    WAITING...
                </div>

                <div id="fleet-status-group" class="hud-fleet-status-group retro-panel">
                    <div class="sw-screw tl" style="transform: scale(0.6); top: 6px; left: 6px;"></div>
                    <div class="sw-screw tr" style="transform: scale(0.6); top: 6px; right: 6px;"></div>
                    <div class="sw-screw bl" style="transform: scale(0.6); bottom: 6px; left: 6px;"></div>
                    <div class="sw-screw br" style="transform: scale(0.6); bottom: 6px; right: 6px;"></div>
                    <div class="fleet-status-display retro-display">
                        <div id="player-status" class="fleet-side">
                            <span class="fleet-label">YOU</span>
                            <div id="player-fleet-icons" class="fleet-icons"></div>
                        </div>
                        <div class="fleet-side">
                            <span class="fleet-label">ENEMY</span>
                            <div id="enemy-fleet-icons" class="fleet-icons"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="hud-bottom-bar">
                <div class="hud-controls-panel ui-interactive" style="grid-template-columns: repeat(9, 1fr);">
                    <div class="sw-screw tl"></div><div class="sw-screw tr"></div>
                    <div class="sw-screw bl"></div><div class="sw-screw br"></div>
                    <div class="sw-mount"><div class="sw-label">STATS</div><div id="led-geek-stats" class="sw-led ${Config.visual.showGeekStats ? 'on-gold' : ''}"></div><div id="hud-btn-geek-stats" class="sw-toggle ${Config.visual.showGeekStats ? 'active' : ''}" title="Toggle Geek Stats"></div></div>
                    <div class="sw-mount"><div class="sw-label">AUTO</div><div id="led-auto-battler" class="sw-led ${Config.autoBattler ? 'on-red' : ''}"></div><div id="hud-btn-auto-battler" class="sw-rocker ${Config.autoBattler ? 'active' : ''}" title="Toggle Auto-Battler"></div></div>
                    <div class="sw-mount"><div class="sw-label">PEEK</div><div id="led-peek" class="sw-led"></div><div id="hud-btn-peek" class="sw-toggle" title="Peek at other side"></div></div>
                    <div class="sw-mount"><div class="sw-label">MODE</div><div id="led-day-night" class="sw-led ${Config.visual.isDayMode ? 'on-gold' : 'on-blue'}"></div><button id="hud-btn-day-night" class="sw-push" title="Toggle Day/Night" style="font-size: 1.2rem;">${Config.visual.isDayMode ? '🌘' : '🌖'}</button></div>
                    <div class="sw-mount"><div class="sw-label">CAM</div><div id="led-cam-reset" class="sw-led"></div><button id="hud-btn-cam-reset" class="sw-push" title="Reset Camera" style="font-size: 0.8rem;">👁️</button></div>
                    <div class="sw-mount"><div class="sw-label">FPS</div><div class="sw-led on-green"></div><button id="hud-btn-fps" class="sw-push" title="Cycle FPS Cap" style="font-size: 0.7rem;">${Config.visual.fpsCap || 60}<br></button></div>
                    <div class="sw-mount"><div class="sw-label">SPEED</div><div class="sw-led on-green"></div><button id="hud-btn-speed" class="sw-push" title="Cycle Speed" style="font-size: 0.7rem;">${Config.timing.gameSpeedMultiplier}X</button></div>
                    <div class="sw-mount" style="grid-column: span 2;"><div class="sw-label">SYSTEM PAUSE</div><div class="sw-led on-red"></div><button id="hud-btn-settings" class="sw-push red" title="Pause Menu" style="width: 100px; border-radius: 4px;">PAUSE</button></div>
                </div>
            </div>
            
            <div id="geek-stats" class="geek-stats-panel" style="display: ${Config.visual.showGeekStats ? 'block' : 'none'};">
                <div class="sw-screw tl" style="transform: scale(0.6); top: 6px; left: 6px;"></div><div class="sw-screw tr" style="transform: scale(0.6); top: 6px; right: 6px;"></div>
                <div class="sw-screw bl" style="transform: scale(0.6); bottom: 6px; left: 6px;"></div><div class="sw-screw br" style="transform: scale(0.6); bottom: 6px; right: 6px;"></div>
                <div class="geek-stats-title">⚙ GEEK STATS</div>
                <div class="retro-display">
                    <div class="geek-stats-row"><span class="gs-label">FPS</span><span class="gs-value" id="gs-fps">--</span></div>
                    <div class="geek-stats-row"><span class="gs-label">FRAME</span><span class="gs-value" id="gs-frame">-- ms</span></div>
                    <div class="geek-stats-row"><span class="gs-label">RAM</span><span class="gs-value" id="gs-ram">-- MB</span></div>
                    <div class="geek-stats-row" title="Distance from camera target"><span class="gs-label">DIST</span><span class="gs-value" id="gs-zoom">--</span></div>
                    <div class="geek-stats-row" title="Camera World Position"><span class="gs-label">POS</span><span class="gs-value" id="gs-pos">--</span></div>
                    <div class="geek-stats-row" title="Camera Target Position"><span class="gs-label">TGT</span><span class="gs-value" id="gs-tgt">--</span></div>
                    <div class="geek-stats-row"><span class="gs-label">STATUS</span><span class="gs-value gs-online" id="gs-status">● LOCAL</span></div>
                    <div class="geek-stats-row"><span class="gs-label">TIME</span><span class="gs-value" id="gs-time">00:00</span></div>
                </div>
            </div>
            <div id="mouse-coords" class="mouse-coords" style="display: none;">(0,0)</div>

            <div id="rogue-action-bar" class="rogue-action-bar hidden">
                <button id="btn-rogue-move" class="action-btn move-btn">Move (<span id="rogue-moves-count">0</span>)</button>
                <button id="btn-rogue-attack" class="action-btn attack-btn">Attack</button>
                <button id="btn-rogue-skip" class="action-btn skip-btn">Skip</button>
            </div>
        `;

        this.turnIndicator = this.container.querySelector('#turn-indicator') as HTMLElement;
        this.playerFleetIcons = this.container.querySelector('#player-fleet-icons') as HTMLElement;
        this.enemyFleetIcons = this.container.querySelector('#enemy-fleet-icons') as HTMLElement;

        // Listen for active ship changes in Rogue mode
        document.addEventListener('ACTIVE_SHIP_CHANGED', (e: Event) => {
            const ce = e as CustomEvent;
            this.activeRogueShip = ce.detail.ship;
            this.updateRogueShipDisplay(this.activeRogueShip);
        });

        // Delegate control binding to HUDControls.ts
        bindHUDControls(this.container);

        this.updateStats();
        this.updateCounters();
        this.bindArsenalEvents();
        this.bindRogueActionBar();
    }

    private bindRogueActionBar(): void {
        const skipBtn = this.container.querySelector('#btn-rogue-skip');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                this.gameLoop.advanceRogueShipTurn();
            });
        }

        const moveBtn = this.container.querySelector('#btn-rogue-move');
        const attackBtn = this.container.querySelector('#btn-rogue-attack');

        const setActiveTab = (mode: 'move' | 'attack') => {
            (window as any).selectedRogueAction = mode;
            if (moveBtn) moveBtn.classList.toggle('active', mode === 'move');
            if (attackBtn) attackBtn.classList.toggle('active', mode === 'attack');
            document.dispatchEvent(new CustomEvent('ROGUE_ACTION_MODE_CHANGED', { detail: { mode } }));
        };

        if (moveBtn) moveBtn.addEventListener('click', () => setActiveTab('move'));
        if (attackBtn) attackBtn.addEventListener('click', () => setActiveTab('attack'));

        // Default to move
        setActiveTab('move');
        
        // Listen for ship change to refresh default if needed
        document.addEventListener('ACTIVE_SHIP_CHANGED', () => {
            if ((window as any).selectedRogueAction !== 'move') {
                setActiveTab('move'); // automatically select move on turn start
            }
        });
    }

    private updateRogueShipDisplay(ship: any): void {
        const isRogue = this.gameLoop.match?.mode === MatchMode.Rogue;
        const actionBar = this.container.querySelector('#rogue-action-bar') as HTMLElement;
        
        if (!isRogue || !ship || !actionBar) {
            if (actionBar) actionBar.classList.add('hidden');
            return;
        }

        const isPlayerTurn = this.gameLoop.currentState === GameState.PLAYER_TURN;
        actionBar.classList.toggle('hidden', !isPlayerTurn);

        // Update Turn Indicator
        if (isPlayerTurn) {
            this.turnIndicator.innerHTML = `
                <div style="font-size: 0.7rem; color: #888; margin-bottom: 2px;">ACTIVE SHIP</div>
                <div style="font-size: 1.1rem; color: #fff; font-weight: bold;">${ship.id}</div>
                <div style="font-size: 0.8rem; color: #0f0; margin-top: 4px;">MOVES: ${ship.movesRemaining}/${ship.maxMoves}</div>
            `;
            this.turnIndicator.style.color = "#0f0";
        }

        // Update Action Bar buttons
        const moveBtn = actionBar.querySelector('#btn-rogue-move') as HTMLButtonElement;
        const attackBtn = actionBar.querySelector('#btn-rogue-attack') as HTMLButtonElement;
        const movesCount = actionBar.querySelector('#rogue-moves-count') as HTMLElement;

        if (movesCount) movesCount.innerText = ship.movesRemaining.toString();
        if (moveBtn) moveBtn.disabled = ship.movesRemaining <= 0 || ship.hasActedThisTurn;
        if (attackBtn) attackBtn.disabled = ship.hasActedThisTurn;
    }

    private bindArsenalEvents(): void {
        const arsenalPanel = this.container.querySelector('#arsenal-panel');
        if (!arsenalPanel) return;

        const buttons = arsenalPanel.querySelectorAll('.arsenal-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const weapon = (btn as HTMLElement).dataset.weapon;
                (window as any).selectedRogueWeapon = weapon;
            });
        });
    }

    public update(state: GameState): void {
        // Dynamic visibility for Rogue vs Classic panels
        const isRogue = this.gameLoop.match?.mode === MatchMode.Rogue;
        const arsenalPanel = this.container.querySelector('#arsenal-panel');
        const statsPanel = this.container.querySelector('#game-stats');
        
        if (arsenalPanel && statsPanel) {
            if (isRogue) {
                arsenalPanel.classList.remove('hidden');
                statsPanel.classList.add('hidden');
            } else {
                arsenalPanel.classList.add('hidden');
                statsPanel.classList.remove('hidden');
            }
        }

        const indicator = this.turnIndicator;
        if (state === GameState.PLAYER_TURN) {
            if (isRogue && this.activeRogueShip) {
                this.updateRogueShipDisplay(this.activeRogueShip);
            } else {
                indicator.innerText = "YOUR TURN";
                indicator.style.color = "#0f0";
            }
        } else if (state === GameState.ENEMY_TURN) {
            indicator.innerText = "ENEMY TURN";
            indicator.style.color = "#0c0";
        } else if (state === GameState.SETUP_BOARD) {
            indicator.innerHTML = `
                <div style="font-size: 1.6rem;">PLACE YOUR SHIPS</div>
                <div style="font-size: 0.9rem; margin-top: 8px; color: #0a0; opacity: 0.8;">PRESS 'R' TO ROTATE</div>
            `;
            indicator.style.color = "#0f0";
        } else if (state === GameState.GAME_OVER) {
            const matchStatus = this.gameLoop.match?.checkGameEnd();
            indicator.innerText = matchStatus === 'player_wins' ? "VICTORY!" : "DEFEAT!";
            indicator.style.color = matchStatus === 'player_wins' ? "#0f0" : "#080";
        }
        this.updateCounters();
    }

    private updateCounters(): void {
        if (this.gameLoop.match) {
            renderFleetIcons(this.playerFleetIcons, this.gameLoop.match.playerBoard.ships);
            renderFleetIcons(this.enemyFleetIcons, this.gameLoop.match.enemyBoard.ships);
        }
    }

    private updateStats(): void {
        if (this.gameLoop.match) {
            updateGameStats(this.container, this.gameLoop);
        }
    }
}
