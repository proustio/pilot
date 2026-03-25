import { Match, MatchMode } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { WeaponType } from '../../domain/board/Board';
import { AIEngine, AIDifficulty } from '../ai/AIEngine';
import { MatchSetup, MatchSetupState } from './MatchSetup';
import { TurnExecutor, TurnExecutorState } from './TurnExecutor';
import { GameEventManager } from './GameEventManager';
import { RogueActionHandler } from './RogueActionHandler';
import { eventBus, GameEventType } from '../events/GameEventBus';

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
    public airStrikeOrientation: Orientation = Orientation.Horizontal;

    public aiEngine: AIEngine;
    public playerAIEngine: AIEngine;

    private listeners: StateChangeListener[] = [];
    private shipPlacedListeners: ShipPlacedListener[] = [];
    private attackResultListeners: AttackResultListener[] = [];
    private shipMovedListeners: ShipMovedListener[] = [];
    private onAnimationsComplete: (() => void) | null = null;

    private matchSetup: MatchSetup;
    private turnExecutor: TurnExecutor;
    private eventManager: GameEventManager;
    private rogueActionHandler: RogueActionHandler;

    private config: any;
    private storage: any;

    constructor(config: any, storage: any) {
        this.config = config;
        this.storage = storage;

        this.aiEngine = new AIEngine();
        this.playerAIEngine = new AIEngine();

        this.aiEngine.setDifficulty(this.config.aiDifficulty as AIDifficulty);
        this.playerAIEngine.setDifficulty(this.config.aiDifficulty as AIDifficulty);

        const sharedState = this as unknown as MatchSetupState & TurnExecutorState;

        this.matchSetup = new MatchSetup(sharedState);
        this.turnExecutor = new TurnExecutor(sharedState);
        this.eventManager = new GameEventManager(this);
        this.rogueActionHandler = new RogueActionHandler(this);

        this.eventManager.registerEventListeners();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal Getters for Managers
    // ─────────────────────────────────────────────────────────────────────────

    public getConfig() { return this.config; }
    public getStorage() { return this.storage; }
    public getTurnExecutor() { return this.turnExecutor; }
    public getRogueActionHandler() { return this.rogueActionHandler; }

    public invokeOnAnimationsComplete(): void {
        if (this.onAnimationsComplete) {
            const callback = this.onAnimationsComplete;
            this.onAnimationsComplete = null;
            callback();
        }
    }

    public onShipMovedInvoke(ship: Ship, x: number, z: number, orient: Orientation): void {
        this.shipMovedListeners.forEach(l => l(ship, x, z, orient));
    }

    public onAttackResultInvoke(x: number, z: number, res: string, isP: boolean, isR: boolean): void {
        this.attackResultListeners.forEach(l => l(x, z, res, isP, isR));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rogue Mode Turn Logic — delegated to RogueActionHandler
    // ─────────────────────────────────────────────────────────────────────────

    public advanceRogueShipTurn(): void {
        this.rogueActionHandler.advanceRogueShipTurn();
    }

    public advanceEnemyRogueShipTurn(): void {
        this.rogueActionHandler.advanceEnemyRogueShipTurn();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API (State & Listeners)
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

    public onShipMoved(listener: ShipMovedListener): void {
        this.shipMovedListeners.push(listener);
    }

    public requestAutoSave(): void {
        if (!this.match || !this.hasUnsavedProgress()) return;
        eventBus.emit(GameEventType.REQUEST_AUTO_SAVE, undefined as any);
    }

    public transitionTo(newState: GameState): void {
        if (this.currentState === newState) return;

        const oldState = this.currentState;
        this.currentState = newState;

        if (this.match) {
            this.config.rogueMode = this.match.mode === MatchMode.Rogue;
        }

        this.listeners.forEach(listener => listener(newState, oldState));

        eventBus.emit(GameEventType.GAME_STATE_CHANGED, { state: newState });
        eventBus.emit(GameEventType.TURN_CHANGED, { newState, oldState });

        this.requestAutoSave();

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
                    eventBus.emit(GameEventType.ACTIVE_SHIP_CHANGED, { ship: this.rogueShipOrder[0], index: 0 });
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

    public startNewMatch(match: Match): void {
        this.matchSetup.startNewMatch(match);
    }

    public loadMatch(
        match: Match,
        resources?: { airStrikes: number; sonars: number; mines: number },
        activeRogueShipIndex?: number,
        activeEnemyRogueShipIndex?: number
    ): void {
        this.config.preferredMode = match.mode;
        this.config.saveConfig();
        this.matchSetup.loadMatch(match, resources, activeRogueShipIndex, activeEnemyRogueShipIndex);
    }

    public onGridClick(x: number, z: number, isPlayerSide?: boolean): void {
        if (!this.match || this.isPaused) return;

        if (this.currentState === GameState.SETUP_BOARD) {
            this.turnExecutor.onSetupBoardClick(x, z, isPlayerSide);
        } else if (this.currentState === GameState.PLAYER_TURN) {
            this.turnExecutor.onPlayerTurnClick(x, z, isPlayerSide);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Complex Rogue Weapon Handler (Still in GameLoop but could be factored more later)
    // ─────────────────────────────────────────────────────────────────────────

    public handleRogueUseWeapon(detail: any): void {
        const { weaponType, targetX, targetZ, directionX, directionZ, radius } = detail;
        if (!this.match || this.currentState !== GameState.PLAYER_TURN || this.config.autoBattler) return;

        const targetBoard = this.match.mode === MatchMode.Rogue ? this.match.sharedBoard : this.match.enemyBoard;
        let turnHandledAsync = false;

        if (weaponType === WeaponType.Mine) {
            const placed = targetBoard.placeMine(targetX, targetZ);
            if (!placed) return;
            this.requestAutoSave();
        } else if (weaponType === WeaponType.Sonar) {
            const results = targetBoard.sonarPing(targetX, targetZ, radius || 2);
            eventBus.emit(GameEventType.SONAR_RESULTS, { hits: results });
            this.isAnimating = true;
            turnHandledAsync = true;
            setTimeout(() => {
                this.isAnimating = false;
                if (this.match!.mode === MatchMode.Rogue) this.advanceRogueShipTurn();
                else this.transitionTo(GameState.ENEMY_TURN);
            }, 1000);
        } else if (weaponType === WeaponType.Cannon || weaponType === 'normal') {
            const result = targetBoard.receiveAttack(targetX, targetZ);
            if (result !== 'invalid') {
                this.onAttackResultInvoke(targetX, targetZ, result.toString(), true, false);
                this.requestAutoSave();
            } else return;
        } else if (weaponType === WeaponType.AirStrike) {
            if (Ship.resources.airStrikes <= 0) return;
            Ship.resources.airStrikes--;
            
            const dx = directionX !== undefined ? directionX : 1;
            const dz = directionZ !== undefined ? directionZ : 0;
            const length = 10;
            const startX = targetX - dx * 4;
            const startZ = targetZ - dz * 4;
            
            const results = targetBoard.dispatchAirStrike(startX, startZ, dx, dz, length);
            this.isAnimating = true;
            turnHandledAsync = true;
            
            results.forEach(res => {
                if (res.result !== 'invalid') this.onAttackResultInvoke(res.x, res.z, res.result, true, false);
            });
            this.requestAutoSave();
            
            this.onAnimationsComplete = () => {
                const status = this.match!.checkGameEnd();
                this.isAnimating = false;
                if (status !== 'ongoing') this.transitionTo(GameState.GAME_OVER);
                else {
                    if (this.match!.mode === MatchMode.Rogue) this.advanceRogueShipTurn();
                    else this.transitionTo(GameState.ENEMY_TURN);
                }
            };
        }

        if (!turnHandledAsync) {
            if (this.match.mode === MatchMode.Rogue) this.advanceRogueShipTurn();
            else this.transitionTo(GameState.ENEMY_TURN);
        }
    }
}
