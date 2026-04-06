import { Match, MatchMode } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';

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
    public onAnimationsComplete: (() => void) | null = null;

    private matchSetup: MatchSetup;
    private turnExecutor: TurnExecutor;
    private eventManager: GameEventManager;
    private rogueActionHandler: RogueActionHandler;

    private config: any;
    private storage: any;

    constructor(config: any, storage: any) {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering constructor`);
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
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting constructor`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal Getters for Managers
    // ─────────────────────────────────────────────────────────────────────────

    public getConfig() { 
        console.log(`[${new Date().toISOString()}] GameLoop: Entering getConfig`);
        const res = this.config; 
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting getConfig`);
        return res;
    }
    public getStorage() { 
        console.log(`[${new Date().toISOString()}] GameLoop: Entering getStorage`);
        const res = this.storage; 
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting getStorage`);
        return res;
    }
    public getTurnExecutor() { 
        console.log(`[${new Date().toISOString()}] GameLoop: Entering getTurnExecutor`);
        const res = this.turnExecutor; 
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting getTurnExecutor`);
        return res;
    }
    public getRogueActionHandler() { 
        console.log(`[${new Date().toISOString()}] GameLoop: Entering getRogueActionHandler`);
        const res = this.rogueActionHandler; 
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting getRogueActionHandler`);
        return res;
    }

    public invokeOnAnimationsComplete(): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering invokeOnAnimationsComplete`);
        if (this.onAnimationsComplete) {
            const callback = this.onAnimationsComplete;
            this.onAnimationsComplete = null;
            callback();
        }
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting invokeOnAnimationsComplete`);
    }

    public onShipMovedInvoke(ship: Ship, x: number, z: number, orient: Orientation): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering onShipMovedInvoke`);
        this.shipMovedListeners.forEach(l => l(ship, x, z, orient));
        if (this.match && this.match.mode === MatchMode.Rogue) {
            eventBus.emit(GameEventType.ROGUE_MOVE_SHIP, { 
                shipId: ship.id, 
                newX: x, 
                newZ: z, 
                newOrientation: orient 
            });
        }
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting onShipMovedInvoke`);
    }

    public onAttackResultInvoke(x: number, z: number, res: string, isP: boolean, isR: boolean): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering onAttackResultInvoke`);
        this.attackResultListeners.forEach(l => l(x, z, res, isP, isR));
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting onAttackResultInvoke`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rogue Mode Turn Logic — delegated to RogueActionHandler
    // ─────────────────────────────────────────────────────────────────────────

    public advanceRogueShipTurn(): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering advanceRogueShipTurn`);
        this.rogueActionHandler.advanceRogueShipTurn();
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting advanceRogueShipTurn`);
    }

    public advanceEnemyRogueShipTurn(): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering advanceEnemyRogueShipTurn`);
        this.rogueActionHandler.advanceEnemyRogueShipTurn();
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting advanceEnemyRogueShipTurn`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API (State & Listeners)
    // ─────────────────────────────────────────────────────────────────────────

    public hasUnsavedProgress(): boolean {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering hasUnsavedProgress`);
        if (!this.match) {
            console.log(`[${new Date().toISOString()}] GameLoop: Exiting hasUnsavedProgress (no match)`);
            return false;
        }
        const hasShots = this.match.playerBoard.shotsFired > 0 || this.match.enemyBoard.shotsFired > 0;
        const hasShipsPlaced = this.match.playerBoard.ships.length > 0;
        const res = hasShots || hasShipsPlaced;
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting hasUnsavedProgress result:`, res);
        return res;
    }

    public onStateChange(listener: StateChangeListener): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering onStateChange`);
        this.listeners.push(listener);
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting onStateChange`);
    }

    public onShipPlaced(listener: ShipPlacedListener): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering onShipPlaced`);
        this.shipPlacedListeners.push(listener);
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting onShipPlaced`);
    }

    public onAttackResult(listener: AttackResultListener): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering onAttackResult`);
        this.attackResultListeners.push(listener);
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting onAttackResult`);
    }

    public onShipMoved(listener: ShipMovedListener): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering onShipMoved`);
        this.shipMovedListeners.push(listener);
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting onShipMoved`);
    }

    public requestAutoSave(): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering requestAutoSave`);
        if (!this.match || !this.hasUnsavedProgress()) {
            console.log(`[${new Date().toISOString()}] GameLoop: Exiting requestAutoSave (no unsaved progress)`);
            return;
        }
        eventBus.emit(GameEventType.REQUEST_AUTO_SAVE, undefined as any);
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting requestAutoSave`);
    }

    public transitionTo(newState: GameState): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering transitionTo`, newState);
        if (this.currentState === newState) {
            console.log(`[${new Date().toISOString()}] GameLoop: Exiting transitionTo (already in state)`);
            return;
        }

        const oldState = this.currentState;
        this.currentState = newState;
        console.log(`[${new Date().toISOString()}] GameLoop: Transitioning to`, newState);

        if (this.match) {
            this.config.rogueMode = this.match.mode === MatchMode.Rogue;
        }

        this.listeners.forEach(listener => listener(newState, oldState));
        
        if (this.match && this.match.mode === MatchMode.Rogue) {
            if (newState === GameState.PLAYER_TURN || newState === GameState.ENEMY_TURN) {
                console.log(`[${new Date().toISOString()}] GameLoop: clearing markers`);
                eventBus.emit(GameEventType.REQUEST_MARKER_CLEANUP, undefined as any);
            }
        }

        eventBus.emit(GameEventType.GAME_STATE_CHANGED, { state: newState });
        eventBus.emit(GameEventType.TURN_CHANGED, { newState, oldState });

        this.requestAutoSave();

        if (newState === GameState.GAME_OVER) {
            console.log(`[${new Date().toISOString()}] GameLoop: game over, clearing session`);
            this.storage.clearSession();
        }

        this.turnExecutor.onEnterState(newState);
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting transitionTo`);
    }

    public startNewMatch(match: Match): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering startNewMatch`);
        console.log(`[${new Date().toISOString()}] GameLoop: Starting new match`);
        this.isAnimating = false;
        this.onAnimationsComplete = null;

        // Apply mode-specific speed defaults
        if (match.mode === MatchMode.Rogue) {
            this.config.timing.gameSpeedMultiplier = 2.0;
        } else {
            this.config.timing.gameSpeedMultiplier = 4.0;
        }
        this.config.saveConfig();

        this.matchSetup.startNewMatch(match);
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting startNewMatch`);
    }

    public loadMatch(
        match: Match,
        resources?: { airStrikes: number; sonars: number; mines: number },
        activeRogueShipIndex?: number,
        activeEnemyRogueShipIndex?: number
    ): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering loadMatch`);
        this.isAnimating = false;
        this.onAnimationsComplete = null;
        this.config.preferredMode = match.mode;
        this.config.saveConfig();
        this.matchSetup.loadMatch(match, resources, activeRogueShipIndex, activeEnemyRogueShipIndex);
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting loadMatch`);
    }

    public onGridClick(x: number, z: number, isPlayerSide?: boolean): void {
        console.log(`[${new Date().toISOString()}] GameLoop: Entering onGridClick`, x, z, isPlayerSide);
        if (!this.match || this.isPaused) {
            console.log(`[${new Date().toISOString()}] GameLoop: Exiting onGridClick (no match or paused)`);
            return;
        }

        if (this.currentState === GameState.SETUP_BOARD) {
            this.turnExecutor.onSetupBoardClick(x, z, isPlayerSide);
        } else if (this.currentState === GameState.PLAYER_TURN) {
            this.turnExecutor.onPlayerTurnClick(x, z, isPlayerSide);
        }
        console.log(`[${new Date().toISOString()}] GameLoop: Exiting onGridClick`);
    }


}
