import { GameLoop, GameState } from './GameLoop';
import { Orientation } from '../../domain/fleet/Ship';
import { AIDifficulty } from '../ai/AIEngine';
import { Ship } from '../../domain/fleet/Ship';
import { eventBus, GameEventType } from '../events/GameEventBus';

export class GameEventManager {
    constructor(private gameLoop: GameLoop) {}

    public registerEventListeners(): void {
        eventBus.on(GameEventType.SET_AI_DIFFICULTY, (payload) => {
            if (payload.difficulty) {
                this.gameLoop.aiEngine.setDifficulty(payload.difficulty as AIDifficulty);
                this.gameLoop.playerAIEngine.setDifficulty(payload.difficulty as AIDifficulty);
            }
        });

        eventBus.on(GameEventType.SET_GAME_SPEED, (payload) => {
            if (payload.speed) {
                this.gameLoop.getConfig().timing.gameSpeedMultiplier = payload.speed;
            }
        });

        eventBus.on(GameEventType.TOGGLE_AUTO_BATTLER, (payload) => {
            if (payload !== undefined) {
                if (this.gameLoop.getConfig().autoBattler && 
                    this.gameLoop.currentState === GameState.PLAYER_TURN && 
                    !this.gameLoop.isAnimating) {
                    this.gameLoop.getTurnExecutor().handleAutoPlayerTurn();
                }
            }
        });

        eventBus.on(GameEventType.DOCUMENT_KEYDOWN, (e) => {
            this.handleKeydown(e);
        });

        eventBus.on(GameEventType.PAUSE_GAME, () => { this.gameLoop.isPaused = true; });
        eventBus.on(GameEventType.RESUME_GAME, () => { this.gameLoop.isPaused = false; });
        eventBus.on(GameEventType.TRIGGER_AUTO_SAVE, () => { this.gameLoop.requestAutoSave(); });

        eventBus.on(GameEventType.SAVE_GAME, (payload) => {
            const { slotId, viewState } = payload || {};
            if (slotId && this.gameLoop.match) {
                this.gameLoop.getStorage().saveGame(
                    slotId, 
                    this.gameLoop.match, 
                    viewState,
                    payload?.activeRogueShipIndex ?? this.gameLoop.activeRogueShipIndex,
                    payload?.activeEnemyRogueShipIndex ?? this.gameLoop.activeEnemyRogueShipIndex
                );
            }
        });

        eventBus.on(GameEventType.LOAD_GAME, (payload) => {
            const slotId = payload?.slotId;
            if (slotId) {
                const loaded = this.gameLoop.getStorage().loadGame(slotId);
                if (loaded) {
                    sessionStorage.setItem('battleships_autoload', slotId.toString());
                    window.location.reload();
                }
            }
        });

        eventBus.on(GameEventType.GAME_ANIMATIONS_COMPLETE, () => {
            this.gameLoop.invokeOnAnimationsComplete();
        });

        eventBus.on(GameEventType.ROGUE_ATTEMPT_MOVE, (payload) => {
            const { targetX, targetZ } = payload;
            this.gameLoop.getRogueActionHandler().handleAttemptMove(targetX, targetZ);
        });

        eventBus.on(GameEventType.ROGUE_MOVE_SHIP, (payload) => {
            const { shipId, newX, newZ, newOrientation } = payload;
            this.handleRogueMoveShip(shipId, newX, newZ, newOrientation);
        });

        eventBus.on(GameEventType.ROGUE_USE_ABILITY, (payload) => {
            const { type } = payload;
            this.handleRogueUseAbility(type);
        });

        eventBus.on(GameEventType.ROGUE_USE_WEAPON, (payload) => {
            this.handleRogueUseWeapon(payload);
        });
    }

    private handleKeydown(e: KeyboardEvent): void {
        const key = e.key;
        const config = this.gameLoop.getConfig();
        const isMatch = (action: string) => {
            const binds = config.keybindings[action];
            return binds && binds.some((b: string) => b.toLowerCase() === key.toLowerCase() || b === key);
        };

        if (isMatch('RotateWeapon')) {
            if (this.gameLoop.currentState === GameState.SETUP_BOARD) {
                const cycle = [Orientation.Horizontal, Orientation.Vertical, Orientation.Left, Orientation.Up];
                let nextIdx = (cycle.indexOf(this.gameLoop.currentPlacementOrientation) + 1) % cycle.length;
                this.gameLoop.currentPlacementOrientation = cycle[nextIdx];
            } else if (this.gameLoop.currentState === GameState.PLAYER_TURN) {
                const weapon = (window as any).selectedRogueWeapon;
                if (weapon === 'airstrike') {
                    this.gameLoop.airStrikeOrientation = this.gameLoop.airStrikeOrientation === Orientation.Horizontal
                        ? Orientation.Vertical
                        : Orientation.Horizontal;
                }
            }
        } else if (this.gameLoop.currentState === GameState.PLAYER_TURN && config.rogueMode) {
            if (isMatch('ToggleMoveSection')) {
                eventBus.emit(GameEventType.SET_ROGUE_ACTION_SECTION, { section: 'move' });
            } else if (isMatch('ToggleAttackSection')) {
                eventBus.emit(GameEventType.SET_ROGUE_ACTION_SECTION, { section: 'attack' });
            } else if (isMatch('ActionSail')) {
                eventBus.emit(GameEventType.SET_ROGUE_ACTION_SECTION, { section: 'move' });
                eventBus.emit(GameEventType.SET_ROGUE_WEAPON, { weapon: 'sail' });
            } else if (isMatch('ActionPing')) {
                eventBus.emit(GameEventType.SET_ROGUE_ACTION_SECTION, { section: 'move' });
                eventBus.emit(GameEventType.SET_ROGUE_WEAPON, { weapon: 'sonar' });
            } else if (isMatch('ActionMine')) {
                eventBus.emit(GameEventType.SET_ROGUE_ACTION_SECTION, { section: 'move' });
                eventBus.emit(GameEventType.SET_ROGUE_WEAPON, { weapon: 'mine' });
            } else if (isMatch('ActionCannon')) {
                eventBus.emit(GameEventType.SET_ROGUE_ACTION_SECTION, { section: 'attack' });
                eventBus.emit(GameEventType.SET_ROGUE_WEAPON, { weapon: 'cannon' });
            } else if (isMatch('ActionAirStrike')) {
                eventBus.emit(GameEventType.SET_ROGUE_ACTION_SECTION, { section: 'attack' });
                eventBus.emit(GameEventType.SET_ROGUE_WEAPON, { weapon: 'airstrike' });
            } else if (isMatch('SkipTurn')) {
                this.gameLoop.getRogueActionHandler().advanceRogueShipTurn();
            }
        }
    }

    private handleRogueMoveShip(shipId: string, newX: number, newZ: number, newOrientation: any): void {
        const { match, currentState, rogueShipOrder, activeRogueShipIndex } = this.gameLoop;
        if (!match || currentState !== GameState.PLAYER_TURN) return;

        const ship = match.sharedBoard.ships.find(s => s.id === shipId);
        if (!ship) return;

        const activeShip = rogueShipOrder[activeRogueShipIndex];
        if (activeShip && activeShip.id !== ship.id) return;

        if (ship.movesRemaining > 0 && !ship.hasActedThisTurn) {
            const moved = match.sharedBoard.moveShip(ship, newX, newZ, newOrientation as Orientation);
            if (moved) {
                ship.movesRemaining--;
                this.gameLoop.onShipMovedInvoke(ship, newX, newZ, newOrientation as Orientation);
                this.gameLoop.requestAutoSave();
            }
        }
    }

    private handleRogueUseAbility(type: string): void {
        if (type === 'sonar' && Ship.resources.sonars > 0) {
            (window as any).queuedRogueAbility = 'sonar';
            eventBus.emit(GameEventType.ROGUE_ABILITY_QUEUED, { type: 'sonar' });
        } else if (type === 'mine' && Ship.resources.mines > 0) {
            (window as any).queuedRogueAbility = 'mine';
            eventBus.emit(GameEventType.ROGUE_ABILITY_QUEUED, { type: 'mine' });
        }
    }
    
    private handleRogueUseWeapon(detail: any): void {
        this.gameLoop.handleRogueUseWeapon(detail);
    }
}
