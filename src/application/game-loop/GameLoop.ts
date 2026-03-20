import { Match } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { AIEngine, AIDifficulty } from '../ai/AIEngine';
import { Config } from '../../infrastructure/config/Config';
import { Storage } from '../../infrastructure/storage/Storage';
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

export class GameLoop {
    public currentState: GameState = GameState.MAIN_MENU;
    public match: Match | null = null;

    public playerShipsToPlace: Ship[] = [];
    public currentPlacementOrientation: Orientation = Orientation.Horizontal;
    public isAnimating: boolean = false;
    public isPaused: boolean = false;
    public aiEngine: AIEngine;
    public playerAIEngine: AIEngine;

    private listeners: StateChangeListener[] = [];
    private shipPlacedListeners: ShipPlacedListener[] = [];
    private attackResultListeners: AttackResultListener[] = [];
    private onAnimationsComplete: (() => void) | null = null;

    private matchSetup: MatchSetup;
    private turnExecutor: TurnExecutor;

    constructor() {
        this.aiEngine = new AIEngine();
        this.playerAIEngine = new AIEngine();

        this.aiEngine.setDifficulty(Config.aiDifficulty as AIDifficulty);
        this.playerAIEngine.setDifficulty(Config.aiDifficulty as AIDifficulty);

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
                Config.timing.gameSpeedMultiplier = parseFloat(ce.detail.speed);
            }
        });

        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail !== undefined) {
                if (Config.autoBattler && this.currentState === GameState.PLAYER_TURN && !this.isAnimating) {
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
                Storage.saveGame(slotId, this.match, viewState);
            }
        });

        document.addEventListener('LOAD_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            const slotId = ce.detail?.slotId;
            if (slotId) {
                const match = Storage.loadGame(slotId);
                if (match) {
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
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API (unchanged from before)
    // ─────────────────────────────────────────────────────────────────────────

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

        this.triggerAutoSave();

        if (newState === GameState.GAME_OVER) {
            Storage.clearSession();
        }

        if (newState === GameState.ENEMY_TURN) {
            this.turnExecutor.handleEnemyTurn();
        } else if (newState === GameState.PLAYER_TURN && Config.autoBattler) {
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
}
