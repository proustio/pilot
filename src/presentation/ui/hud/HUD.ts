import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { MatchMode } from '../../../domain/match/Match';
import { Config } from '../../../infrastructure/config/Config';
import { UnifiedBoardUI } from './UnifiedBoardUI';
import { bindHUDControls } from './HUDControls';
import { updateGameStats } from './HUDStats';
import { Ship } from '../../../domain/fleet/Ship';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { TemplateEngine } from '../templates/TemplateEngine';
import hudTemplate from '../templates/HUD.html?raw';
import { EntityManager } from '../../3d/entities/EntityManager';

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
    private activeRogueShip: Ship | null = null;
    private entityManager: any;

    constructor(gameLoop: GameLoop, entityManager: EntityManager) {
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
        this.container.innerHTML = TemplateEngine.render(hudTemplate, { Config: Config });

        this.turnIndicator = this.container.querySelector('#turn-indicator') as HTMLElement;

        // Listen for active ship changes in Rogue mode
        eventBus.on(GameEventType.ACTIVE_SHIP_CHANGED, (payload) => {
            this.activeRogueShip = payload.ship;
            if (this.activeRogueShip) {
                this.updateRogueShipDisplay(this.activeRogueShip);
            }
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
            const av = this.activeRogueShip?.getAvailableWeapons() || ['cannon'];
            if (mode === 'move') {
                arsenalTitle.innerText = 'MOVE SYSTEMS';
                (window as any).selectedRogueWeapon = 'sail';
                
                let btns = `<button class="arsenal-btn active ${this.activeRogueShip?.movesRemaining && this.activeRogueShip.movesRemaining <= 0 ? 'spent' : ''}" data-weapon="sail" title="Sailing (${this.activeRogueShip?.movesRemaining} Remaining)">🚤</button>`;
                
                if (av.includes('sonar')) {
                    btns += `<button class="arsenal-btn ${(window as any).selectedRogueWeapon === 'sonar' ? 'active' : ''} ${Ship.resources.sonars <= 0 ? 'spent' : ''}" data-weapon="sonar" title="Sonar Ping (${Ship.resources.sonars} Remaining)">📡</button>`;
                }
                if (av.includes('mine')) {
                    btns += `<button class="arsenal-btn ${(window as any).selectedRogueWeapon === 'mine' ? 'active' : ''} ${Ship.resources.mines <= 0 ? 'spent' : ''}" data-weapon="mine" title="Place Mine (${Ship.resources.mines} Remaining)">💣</button>`;
                }
                arsenalItems.innerHTML = btns;
            } else {
                arsenalTitle.innerText = 'ATTACK SYSTEMS';
                (window as any).selectedRogueWeapon = 'cannon';
                
                let btns = `<button class="arsenal-btn active" data-weapon="cannon" title="Normal Cannon (Infinite)">⚔️</button>`;
                
                if (av.includes('air-strike')) {
                    btns += `<button class="arsenal-btn ${(window as any).selectedRogueWeapon === 'airstrike' ? 'active' : ''} ${Ship.resources.airStrikes <= 0 ? 'spent' : ''}" data-weapon="airstrike" title="Air Strike (${Ship.resources.airStrikes} Remaining)">🚀</button>`;
                }
                arsenalItems.innerHTML = btns;
            }
            this.bindArsenalEvents();
        }

        eventBus.emit(GameEventType.ROGUE_ACTION_MODE_CHANGED, { mode });
    };

    if (moveBtn) moveBtn.addEventListener('click', () => setActiveTab('move'));
    if (attackBtn) attackBtn.addEventListener('click', () => setActiveTab('attack'));

    // Default to attack
    setActiveTab('attack');
    
        // Listen for ship change to refresh default if needed
        eventBus.on(GameEventType.ACTIVE_SHIP_CHANGED, () => {
            if ((window as any).selectedRogueAction !== 'attack') {
                setActiveTab('attack');
            }
        });

        eventBus.on(GameEventType.SET_ROGUE_ACTION_SECTION, (payload) => {
            if (payload?.section) {
                setActiveTab(payload.section);
            }
        });

        eventBus.on(GameEventType.SET_ROGUE_WEAPON, (payload) => {
            if (payload?.weapon) {
                (window as any).selectedRogueWeapon = payload.weapon;
                setActiveTab((window as any).selectedRogueAction || 'attack');
            }
        });
    }

    private updateRogueShipDisplay(ship: Ship): void {
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
                <div class="text-[0.7rem] text-[#888] mb-[2px] uppercase tracking-wider">ACTIVE SHIP</div>
                <div class="text-[1.1rem] text-white font-bold uppercase tracking-widest">${ship.id}</div>
                <div class="text-[0.8rem] text-theme-primary mt-1 font-mono">MOVES: ${ship.movesRemaining}/${ship.maxMoves}</div>
            `;
            this.turnIndicator.classList.add('text-theme-primary');
            this.turnIndicator.classList.remove('text-theme-danger');
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
                indicator.classList.add('text-theme-primary');
                indicator.classList.remove('text-theme-danger');
            }
        } else if (state === GameState.ENEMY_TURN) {
            indicator.innerText = "ENEMY TURN";
            indicator.classList.add('text-theme-primary');
            indicator.classList.remove('text-theme-danger');

            eventBus.on(GameEventType.ENEMY_ACTION, (payload) => {
                if (this.gameLoop.currentState !== GameState.ENEMY_TURN) return;
                
                const enemyShip = this.gameLoop.match?.sharedBoard.ships.find(s => s.id === payload.shipId);
                const healthPct = enemyShip ? (enemyShip.segments.filter(s => s).length / enemyShip.size) * 100 : 100;

                indicator.innerHTML = `
                    <div class="text-[0.7rem] text-[#888] mb-[2px] uppercase tracking-wider">ENEMY ACTION</div>
                    <div class="text-[1.1rem] text-theme-danger font-bold uppercase tracking-widest">${payload.shipId}</div>
                    <div class="text-[0.8rem] text-white mt-1 font-mono">${payload.actionType.toUpperCase()}</div>
                    <div class="mt-2 w-full bg-black/40 h-1 rounded overflow-hidden border border-white/5">
                        <div class="h-full bg-theme-danger transition-all duration-300" style="width: ${healthPct}%"></div>
                    </div>
                    <div class="text-[0.6rem] text-theme-danger/60 font-mono mt-0.5 uppercase tracking-tighter text-right">HULL_INTEGRITY: ${Math.round(healthPct)}%</div>
                `;
            });
        } else if (state === GameState.SETUP_BOARD) {
            indicator.innerHTML = `
                <div class="text-[1.6rem] uppercase tracking-tighter">PLACE YOUR SHIPS</div>
                <div class="text-[0.9rem] mt-2 text-theme-primary/80 uppercase font-mono tracking-widest">PRESS 'R' TO ROTATE</div>
            `;
            indicator.classList.add('text-theme-primary');
        } else if (state === GameState.GAME_OVER) {
            const matchStatus = this.gameLoop.match?.checkGameEnd();
            indicator.innerText = matchStatus === 'player_wins' ? "VICTORY!" : "DEFEAT!";
            if (matchStatus === 'player_wins') {
                indicator.classList.add('text-theme-primary');
                indicator.classList.remove('text-theme-danger');
            } else {
                indicator.classList.add('text-theme-danger');
                indicator.classList.remove('text-theme-primary');
            }
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
