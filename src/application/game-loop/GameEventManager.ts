import { GameLoop, GameState } from './GameLoop';
import { Orientation } from '../../domain/fleet/Ship';
import { AIDifficulty } from '../ai/AIEngine';
import { Ship } from '../../domain/fleet/Ship';

export class GameEventManager {
    constructor(private gameLoop: GameLoop) {}

    public registerEventListeners(): void {
        document.addEventListener('SET_AI_DIFFICULTY', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.difficulty) {
                this.gameLoop.aiEngine.setDifficulty(ce.detail.difficulty as AIDifficulty);
                this.gameLoop.playerAIEngine.setDifficulty(ce.detail.difficulty as AIDifficulty);
            }
        });

        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail?.speed) {
                this.gameLoop.getConfig().timing.gameSpeedMultiplier = parseFloat(ce.detail.speed);
            }
        });

        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail !== undefined) {
                if (this.gameLoop.getConfig().autoBattler && 
                    this.gameLoop.currentState === GameState.PLAYER_TURN && 
                    !this.gameLoop.isAnimating) {
                    this.gameLoop.getTurnExecutor().handleAutoPlayerTurn();
                }
            }
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            this.handleKeydown(e);
        });

        document.addEventListener('PAUSE_GAME', () => { this.gameLoop.isPaused = true; });
        document.addEventListener('RESUME_GAME', () => { this.gameLoop.isPaused = false; });
        document.addEventListener('TRIGGER_AUTO_SAVE', () => { this.gameLoop.requestAutoSave(); });

        document.addEventListener('SAVE_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            const { slotId, viewState } = ce.detail || {};
            if (slotId && this.gameLoop.match) {
                this.gameLoop.getStorage().saveGame(
                    slotId, 
                    this.gameLoop.match, 
                    viewState,
                    ce.detail?.activeRogueShipIndex ?? this.gameLoop.activeRogueShipIndex,
                    ce.detail?.activeEnemyRogueShipIndex ?? this.gameLoop.activeEnemyRogueShipIndex
                );
            }
        });

        document.addEventListener('LOAD_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            const slotId = ce.detail?.slotId;
            if (slotId) {
                const loaded = this.gameLoop.getStorage().loadGame(slotId);
                if (loaded) {
                    sessionStorage.setItem('battleships_autoload', slotId.toString());
                    window.location.reload();
                }
            }
        });

        document.addEventListener('GAME_ANIMATIONS_COMPLETE', () => {
            this.gameLoop.invokeOnAnimationsComplete();
        });

        document.addEventListener('ROGUE_ATTEMPT_MOVE', (e: Event) => {
            const ce = e as CustomEvent;
            const { targetX, targetZ } = ce.detail;
            this.gameLoop.getRogueActionHandler().handleAttemptMove(targetX, targetZ);
        });

        document.addEventListener('ROGUE_MOVE_SHIP', (e: Event) => {
            const ce = e as CustomEvent;
            const { shipId, newX, newZ, newOrientation } = ce.detail;
            this.handleRogueMoveShip(shipId, newX, newZ, newOrientation);
        });

        document.addEventListener('ROGUE_USE_ABILITY', (e: Event) => {
            const ce = e as CustomEvent;
            const { type } = ce.detail;
            this.handleRogueUseAbility(type);
        });

        document.addEventListener('ROGUE_USE_WEAPON', (e: Event) => {
            const ce = e as CustomEvent;
            this.handleRogueUseWeapon(ce.detail);
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
                document.dispatchEvent(new CustomEvent('SET_ROGUE_ACTION_SECTION', { detail: { section: 'move' } }));
            } else if (isMatch('ToggleAttackSection')) {
                document.dispatchEvent(new CustomEvent('SET_ROGUE_ACTION_SECTION', { detail: { section: 'attack' } }));
            } else if (isMatch('ActionSail')) {
                document.dispatchEvent(new CustomEvent('SET_ROGUE_ACTION_SECTION', { detail: { section: 'move' } }));
                document.dispatchEvent(new CustomEvent('SET_ROGUE_WEAPON', { detail: { weapon: 'sail' } }));
            } else if (isMatch('ActionPing')) {
                document.dispatchEvent(new CustomEvent('SET_ROGUE_ACTION_SECTION', { detail: { section: 'move' } }));
                document.dispatchEvent(new CustomEvent('SET_ROGUE_WEAPON', { detail: { weapon: 'sonar' } }));
            } else if (isMatch('ActionMine')) {
                document.dispatchEvent(new CustomEvent('SET_ROGUE_ACTION_SECTION', { detail: { section: 'move' } }));
                document.dispatchEvent(new CustomEvent('SET_ROGUE_WEAPON', { detail: { weapon: 'mine' } }));
            } else if (isMatch('ActionCannon')) {
                document.dispatchEvent(new CustomEvent('SET_ROGUE_ACTION_SECTION', { detail: { section: 'attack' } }));
                document.dispatchEvent(new CustomEvent('SET_ROGUE_WEAPON', { detail: { weapon: 'cannon' } }));
            } else if (isMatch('ActionAirStrike')) {
                document.dispatchEvent(new CustomEvent('SET_ROGUE_ACTION_SECTION', { detail: { section: 'attack' } }));
                document.dispatchEvent(new CustomEvent('SET_ROGUE_WEAPON', { detail: { weapon: 'airstrike' } }));
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
            document.dispatchEvent(new CustomEvent('ROGUE_ABILITY_QUEUED', { detail: { type: 'sonar' } }));
        } else if (type === 'mine' && Ship.resources.mines > 0) {
            (window as any).queuedRogueAbility = 'mine';
            document.dispatchEvent(new CustomEvent('ROGUE_ABILITY_QUEUED', { detail: { type: 'mine' } }));
        }
    }
    
    private handleRogueUseWeapon(detail: any): void {
        this.gameLoop.handleRogueUseWeapon(detail);
    }
}
