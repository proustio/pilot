import { AIDifficulty } from '../ai/AIEngine';
import { Ship, Orientation } from '../../domain/fleet/Ship';

export enum GameEventType {
    // UI Triggered
    SHOW_PAUSE_MENU = 'SHOW_PAUSE_MENU',
    SHOW_SETTINGS = 'SHOW_SETTINGS',
    SHOW_SAVE_DIALOG = 'SHOW_SAVE_DIALOG',
    SHOW_LOAD_DIALOG = 'SHOW_LOAD_DIALOG',
    TOGGLE_HUD = 'TOGGLE_HUD',
    TOGGLE_AUTO_BATTLER = 'TOGGLE_AUTO_BATTLER',
    TOGGLE_GEEK_STATS = 'TOGGLE_GEEK_STATS',
    TOGGLE_DAY_NIGHT = 'TOGGLE_DAY_NIGHT',
    
    // Settings & Config
    SET_AI_DIFFICULTY = 'SET_AI_DIFFICULTY',
    SET_GAME_SPEED = 'SET_GAME_SPEED',
    SET_FPS_CAP = 'SET_FPS_CAP',
    THEME_CHANGED = 'THEME_CHANGED',
    
    // Game State & Flow
    PAUSE_GAME = 'PAUSE_GAME',
    RESUME_GAME = 'RESUME_GAME',
    EXIT_GAME = 'EXIT_GAME',
    GAME_OVER = 'GAME_OVER',
    GAME_STATE_CHANGED = 'GAME_STATE_CHANGED',
    STATE_CHANGED = 'STATE_CHANGED',
    TURN_CHANGED = 'TURN_CHANGED',
    
    // Interaction
    MOUSE_CELL_HOVER = 'MOUSE_CELL_HOVER',
    SET_INTERACTION_ENABLED = 'SET_INTERACTION_ENABLED',
    
    // Rogue Mode
    ROGUE_ACTION_MODE_CHANGED = 'ROGUE_ACTION_MODE_CHANGED',
    ACTIVE_SHIP_CHANGED = 'ACTIVE_SHIP_CHANGED',
    SET_ROGUE_ACTION_SECTION = 'SET_ROGUE_ACTION_SECTION',
    SET_ROGUE_WEAPON = 'SET_ROGUE_WEAPON',
    ROGUE_ATTEMPT_MOVE = 'ROGUE_ATTEMPT_MOVE',
    ROGUE_MOVE_SHIP = 'ROGUE_MOVE_SHIP',
    ROGUE_USE_ABILITY = 'ROGUE_USE_ABILITY',
    ROGUE_USE_WEAPON = 'ROGUE_USE_WEAPON',
    ROGUE_ABILITY_QUEUED = 'ROGUE_ABILITY_QUEUED',
    
    // Storage
    SAVE_GAME = 'SAVE_GAME',
    LOAD_GAME = 'LOAD_GAME',
    REQUEST_AUTO_SAVE = 'REQUEST_AUTO_SAVE',
    TRIGGER_AUTO_SAVE = 'TRIGGER_AUTO_SAVE',
    RESTORE_VIEW_STATE = 'RESTORE_VIEW_STATE',
    TOGGLE_PEEK = 'TOGGLE_PEEK',
    PEEK_ENABLED_CHANGED = 'PEEK_ENABLED_CHANGED',
    
    // Engine / Visuals
    GAME_ANIMATIONS_COMPLETE = 'GAME_ANIMATIONS_COMPLETE',
    SET_CAMERA_TARGET = 'SET_CAMERA_TARGET',
    RESET_CAMERA = 'RESET_CAMERA',
    UPDATE_GEEK_STATS = 'UPDATE_GEEK_STATS',
    SONAR_RESULTS = 'SONAR_RESULTS'
}

export interface GameEventPayloads {
    [GameEventType.SHOW_PAUSE_MENU]: void;
    [GameEventType.SHOW_SETTINGS]: void;
    [GameEventType.SHOW_SAVE_DIALOG]: void;
    [GameEventType.SHOW_LOAD_DIALOG]: void;
    [GameEventType.TOGGLE_HUD]: { show: boolean };
    [GameEventType.TOGGLE_AUTO_BATTLER]: { enabled: boolean };
    [GameEventType.TOGGLE_GEEK_STATS]: { show: boolean };
    [GameEventType.TOGGLE_DAY_NIGHT]: void;
    
    [GameEventType.SET_AI_DIFFICULTY]: { difficulty: AIDifficulty };
    [GameEventType.SET_GAME_SPEED]: { speed: number };
    [GameEventType.SET_FPS_CAP]: { fpsCap: number };
    [GameEventType.THEME_CHANGED]: void;
    
    [GameEventType.PAUSE_GAME]: void;
    [GameEventType.RESUME_GAME]: void;
    [GameEventType.EXIT_GAME]: void;
    [GameEventType.GAME_OVER]: { winner: string };
    [GameEventType.GAME_STATE_CHANGED]: { state: any };
    [GameEventType.STATE_CHANGED]: { newState: any, oldState: any };
    [GameEventType.TURN_CHANGED]: { newState: any, oldState: any };
    
    [GameEventType.MOUSE_CELL_HOVER]: { 
        x: number, 
        z: number, 
        isPlayerSide: boolean, 
        source?: '3d' | 'ui',
        clientX?: number,
        clientY?: number
    } | null;
    [GameEventType.SET_INTERACTION_ENABLED]: { enabled: boolean };
    
    [GameEventType.ROGUE_ACTION_MODE_CHANGED]: { mode: string };
    [GameEventType.ACTIVE_SHIP_CHANGED]: { ship: Ship | null, index: number };
    [GameEventType.SET_ROGUE_ACTION_SECTION]: { section: 'move' | 'attack' };
    [GameEventType.SET_ROGUE_WEAPON]: { weapon: string };
    [GameEventType.ROGUE_ATTEMPT_MOVE]: { targetX: number, targetZ: number };
    [GameEventType.ROGUE_MOVE_SHIP]: { shipId: string, newX: number, newZ: number, newOrientation: Orientation };
    [GameEventType.ROGUE_USE_ABILITY]: { type: string };
    [GameEventType.ROGUE_USE_WEAPON]: { type: string, x: number, z: number, orientation?: Orientation };
    [GameEventType.ROGUE_ABILITY_QUEUED]: { type: string };
    
    [GameEventType.SAVE_GAME]: { slotId: number, viewState: any, activeRogueShipIndex?: number, activeEnemyRogueShipIndex?: number };
    [GameEventType.LOAD_GAME]: { slotId: number };
    [GameEventType.REQUEST_AUTO_SAVE]: void;
    [GameEventType.TRIGGER_AUTO_SAVE]: void;
    [GameEventType.RESTORE_VIEW_STATE]: { viewState: any };
    [GameEventType.TOGGLE_PEEK]: { peeking: boolean };
    [GameEventType.PEEK_ENABLED_CHANGED]: { enabled: boolean };
    
    [GameEventType.GAME_ANIMATIONS_COMPLETE]: void;
    [GameEventType.SET_CAMERA_TARGET]: { x: number, y: number, z: number };
    [GameEventType.RESET_CAMERA]: void;
    [GameEventType.UPDATE_GEEK_STATS]: { stats: any };
    [GameEventType.SONAR_RESULTS]: { hits: any };
}

type EventCallback<T extends GameEventType> = (payload: GameEventPayloads[T]) => void;

class GameEventBus {
    private eventTarget: EventTarget;

    constructor() {
        this.eventTarget = new EventTarget();
    }

    public emit<T extends GameEventType>(type: T, payload: GameEventPayloads[T]): void {
        const event = new CustomEvent(type, { detail: payload });
        this.eventTarget.dispatchEvent(event);
    }

    public on<T extends GameEventType>(type: T, callback: EventCallback<T>): void {
        const handler = (event: Event) => {
            const customEvent = event as CustomEvent<GameEventPayloads[T]>;
            callback(customEvent.detail);
        };
        this.eventTarget.addEventListener(type, handler);
    }

    public off<T extends GameEventType>(_type: T, _callback: EventCallback<T>): void {
        // Note: This implementation of 'off' is tricky with anonymous handlers.
        // For now, we'll keep it simple as most listeners in this app are permanent.
    }
}

export const eventBus = new GameEventBus();
