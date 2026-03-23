import { Match, MatchMode } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { WeaponType } from '../../domain/board/Board';
import { AIEngine, AIDifficulty } from '../ai/AIEngine';
import { MatchSetup, MatchSetupState } from './MatchSetup';
import { TurnExecutor, TurnExecutorState } from './TurnExecutor';

export enum GameState {
    MAIN_MENU = 'MAIN_MENU',
    SETUP_BOARD = 'SETUP_BOARD',
    PLAYER_TURN = 'PLAYER_TURN',
    ENEMY_TURN = 'ENEMY_TURN',
    GAME_OVER = 'GAME_OVER'
}

type StateChangeListener = (newState: GameState, oldState: GameState) => void;
type ShipPlacedListener = (ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) => void;
type AttackResultListener = (x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean) => void;
type ShipMovedListener = (ship: Ship, x: number, z: number, orientation: Orientation) => void;

export class GameLoop {
    public currentState: GameState = GameState.MAIN_MENU;
    public match: Match | null = null;

    public playerShipsToPlace: Ship[] = [];
    public currentPlacementOrientation: Orientation = Orientation.Horizontal;
    public isAnimating: boolean = false;
    public isPaused: boolean = false;
    
    // Rogue Mode tracking
    public activeRogueShipIndex: number = 0;
    public rogueShipOrder: Ship[] = [];
    public activeEnemyRogueShipIndex: number = 0;
    public enemyRogueShipOrder: Ship[] = [];

    public aiEngine: AIEngine;
    public playerAIEngine: AIEngine;

    private listeners: StateChangeListener[] = [];
    private shipPlacedListeners: ShipPlacedListener[] = [];
    private attackResultListeners: AttackResultListener[] = [];
    private shipMovedListeners: ShipMovedListener[] = [];
    private onAnimationsComplete: (() => void) | null = null;

    private matchSetup: MatchSetup;
    private turnExecutor: TurnExecutor;

    private config: any;
    private storage: any;

    constructor(config: any, storage: any) {
        this.config = config;
        this.storage = storage;

        this.aiEngine = new AIEngine();
        this.playerAIEngine = new AIEngine();

        this.aiEngine.setDifficulty(this.config.aiDifficulty as AIDifficulty);
        this.playerAIEngine.setDifficulty(this.config.aiDifficulty as AIDifficulty);

        // Build a shared-state view that both helpers read/write through.
        // Using `this` directly keeps all state in one place; the interfaces
        // just document which fields each helper touches.
        const sharedState = this as unknown as MatchSetupState & TurnExecutorState;

        this.matchSetup = new MatchSetup(sharedState);
        this.turnExecutor = new TurnExecutor(sharedState);

        this.registerEventListeners();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event wiring
    // ─────────────────────────────────────────────────────────────────────────

    private registerEventListeners(): void {
        document.addEventListener('SET_AI_DIFFICULTY', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.difficulty) {
                this.aiEngine.setDifficulty(ce.detail.difficulty as AIDifficulty);
                this.playerAIEngine.setDifficulty(ce.detail.difficulty as AIDifficulty);
            }
        });

        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.speed) {
                this.config.timing.gameSpeedMultiplier = parseFloat(ce.detail.speed);
            }
        });

        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail !== undefined) {
                if (this.config.autoBattler && this.currentState === GameState.PLAYER_TURN && !this.isAnimating) {
                    this.turnExecutor.handleAutoPlayerTurn();
                }
            }
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'r' && this.currentState === GameState.SETUP_BOARD) {
                this.currentPlacementOrientation = this.currentPlacementOrientation === Orientation.Horizontal
                    ? Orientation.Vertical
                    : Orientation.Horizontal;
            }
        });

        document.addEventListener('PAUSE_GAME', () => { this.isPaused = true; });
        document.addEventListener('RESUME_GAME', () => { this.isPaused = false; });

        document.addEventListener('TRIGGER_AUTO_SAVE', () => { this.triggerAutoSave(); });

        document.addEventListener('SAVE_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            const slotId = ce.detail?.slotId;
            const viewState = ce.detail?.viewState;
            if (slotId && this.match) {
                this.storage.saveGame(slotId, this.match, viewState);
            }
        });

        document.addEventListener('LOAD_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            const slotId = ce.detail?.slotId;
            if (slotId) {
                const loaded = this.storage.loadGame(slotId);
                if (loaded) {
                    sessionStorage.setItem('battleships_autoload', slotId.toString());
                    window.location.reload();
                } else {
                    console.error(`Failed to load from slot ${slotId}`);
                }
            }
        });

        document.addEventListener('GAME_ANIMATIONS_COMPLETE', () => {
            if (this.onAnimationsComplete) {
                const callback = this.onAnimationsComplete;
                this.onAnimationsComplete = null;
                callback();
            }
        });

        document.addEventListener('ROGUE_ATTEMPT_MOVE', (e: Event) => {
            const ce = e as CustomEvent;
            const { targetX, targetZ } = ce.detail;
            
            if (!this.match || this.currentState !== GameState.PLAYER_TURN || this.config.autoBattler) return;

            const ship = this.rogueShipOrder[this.activeRogueShipIndex];
            if (!ship || ship.hasActedThisTurn || ship.movesRemaining <= 0) return;

            const dx = Math.abs(ship.headX - targetX);
            const dz = Math.abs(ship.headZ - targetZ);
            
            // Only strictly vertical or horizontal movement, no diagonals?
            // "maximum movement radius" typically means manhattan or chebyshev. 
            // In a grid game without diagonals, let's just use Manhattan.
            
            const dist = dx + dz;
            if (dist > 0 && dist <= ship.movesRemaining) {
                // Determine new orientation: 
                let newOrient = ship.orientation;
                if (dx > dz) newOrient = Orientation.Horizontal;
                else if (dz > dx) newOrient = Orientation.Vertical;

                // Move ship with the new calculated orientation, 
                // `moveShip` checks boundaries and collisions.
                const moved = this.match.sharedBoard.moveShip(ship, targetX, targetZ, newOrient);
                if (moved) {
                    ship.movesRemaining -= dist;
                    
                    // Ability Dispersal Logic ... (as before)
                    const queuedAbility = (window as any).queuedRogueAbility;
                    if (queuedAbility) {
                        if (queuedAbility === 'sonar' && Ship.resources.sonars > 0) {
                            Ship.resources.sonars--;
                            this.disperseAbilityAlongPath(ship, targetX, targetZ, 'sonar');
                        } else if (queuedAbility === 'mine' && Ship.resources.mines > 0) {
                            Ship.resources.mines--;
                            this.disperseAbilityAlongPath(ship, targetX, targetZ, 'mine');
                        }
                        (window as any).queuedRogueAbility = null;
                        
                        // Using an ability DOES end the ship's turn action
                        ship.hasActedThisTurn = true;
                        ship.movesRemaining = 0;
                    }

                    this.shipMovedListeners.forEach(listener => listener(ship, targetX, targetZ, newOrient));

                    if (ship.movesRemaining <= 0 || ship.hasActedThisTurn) {
                        this.isAnimating = true;
                        setTimeout(() => {
                            this.isAnimating = false;
                            this.advanceRogueShipTurn();
                        }, 800);
                    }
                }
            }
        });

        document.addEventListener('ROGUE_MOVE_SHIP', (e: Event) => {
            const ce = e as CustomEvent;
            const { shipId, newX, newZ, newOrientation } = ce.detail;
            if (!this.match || this.currentState !== GameState.PLAYER_TURN) return;

            const ship = this.match.sharedBoard.ships.find(s => s.id === shipId);
            if (!ship) return;

            const activeShip = this.rogueShipOrder[this.activeRogueShipIndex];
            if (activeShip && activeShip.id !== ship.id) {
                return; // Can only move the currently active ship
            }

            if (ship.movesRemaining > 0 && !ship.hasActedThisTurn) {
                const moved = this.match.sharedBoard.moveShip(ship, newX, newZ, newOrientation as Orientation);
                if (moved) {
                    ship.movesRemaining--;
                    this.shipMovedListeners.forEach(listener => listener(ship, newX, newZ, newOrientation as Orientation));
                }
            }
        });

        document.addEventListener('ROGUE_USE_ABILITY', (e: Event) => {
            const ce = e as CustomEvent;
            const { type } = ce.detail;
            
            if (type === 'sonar' && Ship.resources.sonars > 0) {
                (window as any).queuedRogueAbility = 'sonar';
                document.dispatchEvent(new CustomEvent('ROGUE_ABILITY_QUEUED', { detail: { type: 'sonar' } }));
            } else if (type === 'mine' && Ship.resources.mines > 0) {
                (window as any).queuedRogueAbility = 'mine';
                document.dispatchEvent(new CustomEvent('ROGUE_ABILITY_QUEUED', { detail: { type: 'mine' } }));
            }
        });

        document.addEventListener('ROGUE_USE_WEAPON', (e: Event) => {
            const ce = e as CustomEvent;
            const { weaponType, targetX, targetZ, directionX, directionZ, radius } = ce.detail;
            
            if (!this.match || this.currentState !== GameState.PLAYER_TURN || this.config.autoBattler) return;

            const targetBoard = this.match.mode === MatchMode.Rogue ? this.match.sharedBoard : this.match.enemyBoard;

            let turnHandledAsync = false;

            if (weaponType === WeaponType.Mine) {
                const placed = targetBoard.placeMine(targetX, targetZ);
                if (!placed) return; // invalid placement, do not consume turn
            } else if (weaponType === WeaponType.Sonar) {
                const results = targetBoard.sonarPing(targetX, targetZ, radius || 2);
                document.dispatchEvent(new CustomEvent('SONAR_RESULTS', { detail: { hits: results } }));
                // Trigger visual feedback
                this.isAnimating = true;
                turnHandledAsync = true;
                
                const finalizeTurn = () => {
                    this.isAnimating = false;
                    if (this.match!.mode === MatchMode.Rogue) {
                        this.advanceRogueShipTurn();
                    } else {
                        this.transitionTo(GameState.ENEMY_TURN);
                    }
                };
                setTimeout(finalizeTurn, 1000); // Temporary visual delay for sonar
                
            } else if (weaponType === WeaponType.Cannon || weaponType === 'normal') {
                const result = targetBoard.receiveAttack(targetX, targetZ);
                if (result !== 'invalid') {
                    this.attackResultListeners.forEach(l => l(targetX, targetZ, result.toString(), true, false));
                } else {
                    return; // Don't consume turn for an invalid shot
                }
            } else if (weaponType === WeaponType.AirStrike) {
                if (Ship.resources.airStrikes <= 0) return;
                Ship.resources.airStrikes--;
                const results = targetBoard.dispatchAirStrike(targetX, targetZ, directionX || 1, directionZ || 0);
                this.isAnimating = true;
                turnHandledAsync = true;
                
                results.forEach(res => {
                    if (res.result !== 'invalid') {
                        this.attackResultListeners.forEach(l => l(res.x, res.z, res.result, true, false));
                    }
                });
                
                const finalizeTurn = () => {
                    let status: 'ongoing' | 'player_wins' | 'enemy_wins' = 'ongoing';
                    try {
                        status = this.match!.checkGameEnd();
                    } catch (e: any) { }
                    this.isAnimating = false;
                    if (status !== 'ongoing') {
                        this.transitionTo(GameState.GAME_OVER);
                    } else {
                        if (this.match!.mode === MatchMode.Rogue) {
                            this.advanceRogueShipTurn();
                        } else {
                            this.transitionTo(GameState.ENEMY_TURN);
                        }
                    }
                };
                
                this.onAnimationsComplete = finalizeTurn;
            }

            if (!turnHandledAsync) {
                if (this.match.mode === MatchMode.Rogue) {
                    this.advanceRogueShipTurn();
                } else {
                    this.transitionTo(GameState.ENEMY_TURN);
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API (unchanged from before)
    // ─────────────────────────────────────────────────────────────────────────

    public advanceRogueShipTurn(): void {
        this.activeRogueShipIndex++;
        
        while (this.activeRogueShipIndex < this.rogueShipOrder.length) {
            const ship = this.rogueShipOrder[this.activeRogueShipIndex];
            if (!ship.isSunk()) {
                document.dispatchEvent(new CustomEvent('ACTIVE_SHIP_CHANGED', { detail: { ship } }));
                return;
            }
            this.activeRogueShipIndex++;
        }
        
        // All player ships have acted
        this.transitionTo(GameState.ENEMY_TURN);
    }

    public advanceEnemyRogueShipTurn(): void {
        this.activeEnemyRogueShipIndex++;
        
        while (this.activeEnemyRogueShipIndex < this.enemyRogueShipOrder.length) {
            const ship = this.enemyRogueShipOrder[this.activeEnemyRogueShipIndex];
            if (!ship.isSunk()) {
                // The TurnExecutor will handle exactly one AI attack
                this.turnExecutor.handleEnemyTurn();
                return;
            }
            this.activeEnemyRogueShipIndex++;
        }
        
        // All enemy ships have acted
        this.transitionTo(GameState.PLAYER_TURN);
    }

    public hasUnsavedProgress(): boolean {
        if (!this.match) return false;
        const hasShots = this.match.playerBoard.shotsFired > 0 || this.match.enemyBoard.shotsFired > 0;
        const hasShipsPlaced = this.match.playerBoard.ships.length > 0;
        return hasShots || hasShipsPlaced;
    }

    public onStateChange(listener: StateChangeListener): void {
        this.listeners.push(listener);
    }

    public onShipPlaced(listener: ShipPlacedListener): void {
        this.shipPlacedListeners.push(listener);
    }

    public onAttackResult(listener: AttackResultListener): void {
        this.attackResultListeners.push(listener);
    }

    public onShipMoved(listener: ShipMovedListener): void {
        this.shipMovedListeners.push(listener);
    }

    public triggerAutoSave(): void {
        if (!this.match || !this.hasUnsavedProgress()) return;
        document.dispatchEvent(new CustomEvent('SAVE_GAME', {
            detail: { slotId: 'session' }
        }));
    }

    public transitionTo(newState: GameState): void {
        if (this.currentState === newState) return;

        const oldState = this.currentState;
        this.currentState = newState;

        this.listeners.forEach(listener => listener(newState, oldState));

        // Sync setup phase to 3D layer for highlighting
        // (Assuming entityManager is available or we fire a global event)
        // Wait, I need to check how GameLoop communicates with the presentation layer.
        // It uses listeners. I'll fire a custom event instead to be safe.
        document.dispatchEvent(new CustomEvent('GAME_STATE_CHANGED', { detail: { state: newState } }));

        this.triggerAutoSave();

        if (newState === GameState.GAME_OVER) {
            this.storage.clearSession();
        }

        if (newState === GameState.PLAYER_TURN) {
            if (this.match && this.match.mode === MatchMode.Rogue) {
                this.rogueShipOrder = this.match.sharedBoard.ships
                    .filter(s => !s.isEnemy && !s.isSunk())
                    .sort((a, b) => a.size - b.size);
                
                this.rogueShipOrder.forEach(s => s.resetTurnAction());
                this.activeRogueShipIndex = 0;

                if (this.rogueShipOrder.length > 0) {
                    document.dispatchEvent(new CustomEvent('ACTIVE_SHIP_CHANGED', { detail: { ship: this.rogueShipOrder[0] } }));
                } else if (!this.config.autoBattler) {
                    this.transitionTo(GameState.ENEMY_TURN);
                    return;
                }
            }
        } else if (newState === GameState.ENEMY_TURN) {
            if (this.match && this.match.mode === MatchMode.Rogue) {
                this.enemyRogueShipOrder = this.match.sharedBoard.ships
                    .filter(s => s.isEnemy && !s.isSunk())
                    .sort((a, b) => a.size - b.size);
                
                this.enemyRogueShipOrder.forEach(s => s.resetTurnAction());
                this.activeEnemyRogueShipIndex = 0;
            }
        }

        if (newState === GameState.ENEMY_TURN) {
            this.turnExecutor.handleEnemyTurn();
        } else if (newState === GameState.PLAYER_TURN && this.config.autoBattler) {
            this.turnExecutor.handleAutoPlayerTurn();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Match lifecycle — delegated to MatchSetup
    // ─────────────────────────────────────────────────────────────────────────

    public startNewMatch(match: Match): void {
        this.matchSetup.startNewMatch(match);
    }

    public loadMatch(match: Match): void {
        this.config.preferredMode = match.mode;
        this.config.saveConfig();
        this.matchSetup.loadMatch(match);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Input handler — routed by current state to TurnExecutor
    // ─────────────────────────────────────────────────────────────────────────

    public onGridClick(x: number, z: number, isPlayerSide?: boolean): void {
        if (!this.match || this.isPaused) return;

        if (this.currentState === GameState.SETUP_BOARD) {
            this.turnExecutor.onSetupBoardClick(x, z, isPlayerSide);
        } else if (this.currentState === GameState.PLAYER_TURN) {
            this.turnExecutor.onPlayerTurnClick(x, z, isPlayerSide);
        }
    }
    private disperseAbilityAlongPath(ship: Ship, targetX: number, targetZ: number, type: 'sonar' | 'mine') {
        const startX = ship.headX;
        const startZ = ship.headZ;
        
        // Find a random step along the Manhattan path
        const dx = targetX - startX;
        const dz = targetZ - startZ;
        
        // For simplicity, pick one cell adjacent to the midpoint or start/end
        const midX = Math.floor(startX + dx / 2);
        const midZ = Math.floor(startZ + dz / 2);
        
        // Adjacent random offset
        const rx = midX + (Math.random() > 0.5 ? 1 : -1);
        const rz = midZ + (Math.random() > 0.5 ? 1 : -1);
        
        if (this.match && !this.match.sharedBoard.isOutOfBounds(rx, rz)) {
            if (type === 'sonar') {
                this.match.sharedBoard.receiveAttack(rx, rz); // Sonar revealing fog
                this.attackResultListeners.forEach(l => l(rx, rz, 'sonar', true, false));
            } else {
                // Mines could be a new cell state, but for now let's just mark it as a 'miss' that can be hit?
                // Or just a special visual effect. 
                this.attackResultListeners.forEach(l => l(rx, rz, 'mine', true, false));
            }
        }
    }
}
