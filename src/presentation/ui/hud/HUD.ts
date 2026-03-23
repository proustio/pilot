import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { MatchMode } from '../../../domain/match/Match';
import { Config } from '../../../infrastructure/config/Config';
import { UnifiedBoardUI } from './UnifiedBoardUI';
import { bindHUDControls } from './HUDControls';
import { updateGameStats } from './HUDStats';
import { Ship } from '../../../domain/fleet/Ship';

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
    private unifiedBoard!: UnifiedBoardUI;
    private activeRogueShip: any = null;
    private entityManager: any;

    constructor(gameLoop: GameLoop, entityManager: any) {
        super('hud');
        this.gameLoop = gameLoop;
        this.entityManager = entityManager;

        // Listen to game loop state changes
        this.gameLoop.onStateChange((newState, _oldState) => {
            this.update(newState);
        });

        // Listen for attack results to update stats
        this.gameLoop.onAttackResult((_x, _z, result, _isPlayer, _isReplay) => {
            if (result === 'sunk') {
                this.updateCounters();
            }
            this.updateStats();
        });

        this.unifiedBoard = new UnifiedBoardUI(this.gameLoop, this.entityManager);
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

                    <div id="rogue-action-bar" class="rogue-action-bar ${Config.rogueMode ? '' : 'hidden'}">
                        <button id="btn-rogue-move" class="action-btn move-btn">MOVE</button>
                        <button id="btn-rogue-attack" class="action-btn attack-btn">ATTACK</button>
                        <button id="btn-rogue-skip" class="action-btn skip-btn">SKIP</button>
                    </div>

                    <div class="hud-arsenal-panel retro-panel ${Config.rogueMode ? 'collapsed' : 'hidden'}" id="arsenal-panel">
                        <div class="sw-screw tl"></div><div class="sw-screw tr"></div>
                        <div class="sw-screw bl"></div><div class="sw-screw br"></div>
                        <div class="arsenal-title">MOVE SYSTEMS</div>
                        <div class="arsenal-items">
                            <button class="arsenal-btn" data-weapon="sonar" title="Sonar Ping (2 Remaining)">📡</button>
                            <button class="arsenal-btn" data-weapon="mine" title="Place Mine (5 Remaining)">⚓</button>
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
            </div>
            
            <div class="hud-bottom-bar">
                <div class="hud-controls-panel ui-interactive" style="grid-template-columns: repeat(9, 1fr);">
                    <div class="sw-screw tl"></div><div class="sw-screw tr"></div>
                    <div class="sw-screw bl"></div><div class="sw-screw br"></div>
                    <div class="sw-mount"><div class="sw-label">STATS</div><div id="led-geek-stats" class="sw-led ${Config.visual.showGeekStats ? 'on-gold' : ''}"></div><div id="hud-btn-geek-stats" class="sw-toggle ${Config.visual.showGeekStats ? 'active' : ''}" title="Toggle Geek Stats"></div></div>
                    <div class="sw-mount"><div class="sw-label">AUTO</div><div id="led-auto-battler" class="sw-led ${Config.autoBattler ? 'on-red' : ''}"></div><div id="hud-btn-auto-battler" class="sw-rocker ${Config.autoBattler ? 'active' : ''}" title="Toggle Auto-Battler"></div></div>
                    <div class="sw-mount ${Config.rogueMode ? 'hidden' : ''}"><div class="sw-label">PEEK</div><div id="led-peek" class="sw-led"></div><div id="hud-btn-peek" class="sw-toggle" title="Peek at other side"></div></div>
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
        `;

        this.turnIndicator = this.container.querySelector('#turn-indicator') as HTMLElement;

        // Listen for active ship changes in Rogue mode
        document.addEventListener('ACTIVE_SHIP_CHANGED', (e: Event) => {
            const ce = e as CustomEvent;
            this.activeRogueShip = ce.detail.ship;
            this.updateRogueShipDisplay(this.activeRogueShip);
        });

        // Delegate control binding to HUDControls.ts
        bindHUDControls(this.container);

        this.updateStats();
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
        const arsenalPanel = this.container.querySelector('#arsenal-panel');
        const arsenalTitle = this.container.querySelector('.arsenal-title') as HTMLElement;
        const arsenalItems = this.container.querySelector('.arsenal-items') as HTMLElement;

        const setActiveTab = (mode: 'move' | 'attack') => {
            (window as any).selectedRogueAction = mode;
        if (moveBtn) moveBtn.classList.toggle('active', mode === 'move');
        if (attackBtn) attackBtn.classList.toggle('active', mode === 'attack');
        
        if (arsenalPanel && arsenalTitle && arsenalItems) {
            arsenalPanel.classList.remove('collapsed');
            const selected = (window as any).selectedRogueWeapon;
            if (mode === 'move') {
                arsenalTitle.innerText = 'MOVE SYSTEMS';
                arsenalItems.innerHTML = `
                    <button class="arsenal-btn ${selected === 'sail' || !selected ? 'active' : ''} ${this.activeRogueShip?.movesRemaining <= 0 ? 'spent' : ''}" data-weapon="sail" title="Sailing (${this.activeRogueShip?.movesRemaining} Remaining)">⚓</button>
                    <button class="arsenal-btn ${selected === 'sonar' ? 'active' : ''} ${Ship.resources.sonars <= 0 ? 'spent' : ''}" data-weapon="sonar" title="Sonar Ping (${Ship.resources.sonars} Remaining)">📡</button>
                    <button class="arsenal-btn ${selected === 'mine' ? 'active' : ''} ${Ship.resources.mines <= 0 ? 'spent' : ''}" data-weapon="mine" title="Place Mine (${Ship.resources.mines} Remaining)">⚓</button>
                `;
                if (!selected || mode !== 'move') (window as any).selectedRogueWeapon = 'sail';
            } else {
                arsenalTitle.innerText = 'ATTACK SYSTEMS';
                arsenalItems.innerHTML = `
                    <button class="arsenal-btn ${selected === 'cannon' || !selected ? 'active' : ''}" data-weapon="cannon" title="Normal Cannon (Infinite)">⚔️</button>
                    <button class="arsenal-btn ${selected === 'airstrike' ? 'active' : ''} ${Ship.resources.airStrikes <= 0 ? 'spent' : ''}" data-weapon="airstrike" title="Air Strike (${Ship.resources.airStrikes} Remaining)">🚀</button>
                `;
                if (!selected || mode !== 'attack') (window as any).selectedRogueWeapon = 'cannon';
            }
            this.bindArsenalEvents();
        }

        document.dispatchEvent(new CustomEvent('ROGUE_ACTION_MODE_CHANGED', { detail: { mode } }));
    };

    if (moveBtn) moveBtn.addEventListener('click', () => setActiveTab('move'));
    if (attackBtn) attackBtn.addEventListener('click', () => setActiveTab('attack'));

    // Default to attack
    setActiveTab('attack');
    
        // Listen for ship change to refresh default if needed
        document.addEventListener('ACTIVE_SHIP_CHANGED', () => {
            if ((window as any).selectedRogueAction !== 'attack') {
                setActiveTab('attack'); // automatically select attack on turn start
            }
        });

        document.addEventListener('SET_ROGUE_ACTION_SECTION', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.section) {
                setActiveTab(ce.detail.section);
            }
        });

        document.addEventListener('SET_ROGUE_WEAPON', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.weapon) {
                (window as any).selectedRogueWeapon = ce.detail.weapon;
                setActiveTab((window as any).selectedRogueAction || 'attack'); // Refresh UI
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
        // Removed as per request
    }

    private updateStats(): void {
        if (this.gameLoop.match) {
            updateGameStats(this.container, this.gameLoop);
        }
    }
}
