import { Match } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { CellState } from '../../domain/board/Board';
import { AIEngine, AIDifficulty } from '../ai/AIEngine';
import { Config } from '../../infrastructure/config/Config';
import { Storage, ViewState } from '../../infrastructure/storage/Storage';
import { getCoords } from '../../domain/board/BoardUtils';

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

    constructor() {
        this.aiEngine = new AIEngine();
        this.playerAIEngine = new AIEngine();

        // Apply initial config difficulty
        this.aiEngine.setDifficulty(Config.aiDifficulty as AIDifficulty);
        this.playerAIEngine.setDifficulty(Config.aiDifficulty as AIDifficulty);

        // Listen for AI difficulty changes
        document.addEventListener('SET_AI_DIFFICULTY', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.difficulty) {
                this.aiEngine.setDifficulty(customEvent.detail.difficulty as AIDifficulty);
                this.playerAIEngine.setDifficulty(customEvent.detail.difficulty as AIDifficulty);
            }
        });

        // Listen for Game Speed changes
        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.speed) {
                Config.timing.gameSpeedMultiplier = parseFloat(customEvent.detail.speed);
            }
        });

        // Listen for Auto-Battler toggling
        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail !== undefined) {
                if (Config.autoBattler && this.currentState === GameState.PLAYER_TURN && !this.isAnimating) {
                    this.handleAutoPlayerTurn();
                }
            }
        });

        // Listen for Ship Rotation requested by key
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'r' && this.currentState === GameState.SETUP_BOARD) {
                this.currentPlacementOrientation = this.currentPlacementOrientation === Orientation.Horizontal
                    ? Orientation.Vertical
                    : Orientation.Horizontal;
            }
        });

        // Listen for Pause/Resume
        document.addEventListener('PAUSE_GAME', () => {
            this.isPaused = true;
        });

        document.addEventListener('RESUME_GAME', () => {
            this.isPaused = false;
        });

        // Listen for internal state request to trigger session auto save
        document.addEventListener('TRIGGER_AUTO_SAVE', () => {
            this.triggerAutoSave();
        });

        // Listen for Save/Load events
        document.addEventListener('SAVE_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            const slotId = ce.detail?.slotId;
            const viewState: ViewState | undefined = ce.detail?.viewState;
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
                    // Reload to get a clean 3D state, then auto-load
                    // Store the slot to load in sessionStorage so the reload can pick it up
                    sessionStorage.setItem('battleships_autoload', slotId.toString());
                    window.location.reload();
                } else {
                    console.error(`Failed to load from slot ${slotId}`);
                }
            }
        });
    }

    /**
     * Returns true if the current match has any progress worth saving.
     */
    public hasUnsavedProgress(): boolean {
        if (!this.match) return false;
        const hasShots = this.match.playerBoard.shotsFired > 0 || this.match.enemyBoard.shotsFired > 0;
        const hasShipsPlaced = this.match.playerBoard.ships.length > 0;
        return hasShots || hasShipsPlaced;
    }

    /**
     * Subscribe to state transition events (for UI / 3D to react)
     */
    public onStateChange(listener: StateChangeListener) {
        this.listeners.push(listener);
    }

    public onShipPlaced(listener: ShipPlacedListener) {
        this.shipPlacedListeners.push(listener);
    }

    public onAttackResult(listener: AttackResultListener) {
        this.attackResultListeners.push(listener);
    }

    /**
     * Triggers an auto-save for the current session.
     */
    public triggerAutoSave() {
        if (!this.match || !this.hasUnsavedProgress()) return;

        document.dispatchEvent(new CustomEvent('SAVE_GAME', {
            detail: { slotId: 'session' }
        }));
    }

    /**
     * Executes a state transition and notifies all subscribers.
     */
    public transitionTo(newState: GameState) {
        if (this.currentState === newState) return;

        const oldState = this.currentState;
        this.currentState = newState;

        this.listeners.forEach(listener => listener(newState, oldState));

        this.triggerAutoSave();

        if (newState === GameState.GAME_OVER) {
            Storage.clearSession();
        }

        if (newState === GameState.ENEMY_TURN) {
            this.handleEnemyTurn();
        } else if (newState === GameState.PLAYER_TURN && Config.autoBattler) {
            this.handleAutoPlayerTurn();
        }
    }

    public startNewMatch(match: Match) {
        this.match = match;
        this.aiEngine.reset();
        this.playerAIEngine.reset();

        this.playerShipsToPlace = match.getRequiredFleet();

        if (Config.autoBattler) {
            const playerShips = match.getRequiredFleet();
            for (const ship of playerShips) {
                let placed = false;
                let attempts = 0;
                while (!placed && attempts < 1000) {
                    const x = Math.floor(Math.random() * match.playerBoard.width);
                    const z = Math.floor(Math.random() * match.playerBoard.height);
                    const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;

                    if (match.validatePlacement(match.playerBoard, ship, x, z, orient)) {
                        placed = match.playerBoard.placeShip(ship, x, z, orient);
                        if (placed) {
                            this.shipPlacedListeners.forEach(l => l(ship, x, z, orient, true));
                        }
                    }
                    attempts++;
                }
            }
            this.playerShipsToPlace = [];
        }

        const enemyShips = match.getRequiredFleet();
        for (const ship of enemyShips) {
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 1000) {
                const x = Math.floor(Math.random() * match.enemyBoard.width);
                const z = Math.floor(Math.random() * match.enemyBoard.height);
                const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;

                if (match.validatePlacement(match.enemyBoard, ship, x, z, orient)) {
                    placed = match.enemyBoard.placeShip(ship, x, z, orient);
                    if (placed) {
                        this.shipPlacedListeners.forEach(l => l(ship, x, z, orient, false));
                    }
                }
                attempts++;
            }
        }

        if (this.playerShipsToPlace.length === 0) {
            this.transitionTo(GameState.PLAYER_TURN);
        } else {
            this.transitionTo(GameState.SETUP_BOARD);
        }
    }

    /**
     * Resumes an existing match.
     */
    public loadMatch(match: Match) {
        this.match = match;

        this.replayShips(match);

        this.replayAttacks(match);

        this.transitionTo(GameState.PLAYER_TURN);
    }

    /**
     * Fires onShipPlaced for every already-placed ship in both boards.
     * This makes EntityManager spawn the 3D meshes for a loaded game.
     */
    private replayShips(match: Match) {
        for (const ship of match.playerBoard.ships) {
            if (ship.isPlaced) {
                this.shipPlacedListeners.forEach(l => l(ship, ship.headX, ship.headZ, ship.orientation as Orientation, true));
            }
        }
        for (const ship of match.enemyBoard.ships) {
            if (ship.isPlaced) {
                this.shipPlacedListeners.forEach(l => l(ship, ship.headX, ship.headZ, ship.orientation as Orientation, false));
            }
        }
    }

    /**
     * Fires onAttackResult for every Hit/Miss/Sunk cell in both boards.
     * Called after replayShips() so ships exist before markers reference them.
     * isReplay=true lets the presentation layer place markers instantly (no arc animation).
     */
    private replayAttacks(match: Match) {
        const resultMap: Record<number, string> = {
            [CellState.Hit]: 'hit',
            [CellState.Miss]: 'miss',
            [CellState.Sunk]: 'sunk',
        };

        match.playerBoard.gridState.forEach((cell, index) => {
            const result = resultMap[cell];
            if (result) {
                const { x, z } = getCoords(index, match.playerBoard.width);
                this.attackResultListeners.forEach(l => l(x, z, result, false, true));
            }
        });

        match.enemyBoard.gridState.forEach((cell, index) => {
            const result = resultMap[cell];
            if (result) {
                const { x, z } = getCoords(index, match.enemyBoard.width);
                this.attackResultListeners.forEach(l => l(x, z, result, true, true));
            }
        });
    }

    private handleEnemyTurn() {
        if (!this.match) return;

        const executeTurn = () => {
            if (!this.match) return;

            if (this.isPaused) {
                setTimeout(executeTurn, 100);
                return;
            }

            this.isAnimating = true;

            const flipWait = Config.timing.boardFlipWaitMs / Config.timing.gameSpeedMultiplier;
            setTimeout(() => {
                setTimeout(() => {
                    if (!this.match) return;

                    if (this.isPaused) {
                        this.isAnimating = false;
                        executeTurn();
                        return;
                    }

                    const target = this.aiEngine.computeNextMove(this.match.playerBoard, this.match);

                    const result = this.match.playerBoard.receiveAttack(target.x, target.z);

                    this.aiEngine.reportResult(target.x, target.z, result.toString(), this.match.playerBoard);

                    this.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), false, false));

                    const finalizeTurn = () => {
                        if (this.isPaused) {
                            setTimeout(finalizeTurn, 100);
                            return;
                        }

                        let status: 'ongoing' | 'player_wins' | 'enemy_wins' = 'ongoing';
                    try {
                        status = this.match!.checkGameEnd();
                    } catch (e: any) {
                        if (e.message === 'Board has no ships') {
                            document.dispatchEvent(new CustomEvent('EXIT_GAME'));
                            return;
                        }
                        throw e;
                    }
                        this.isAnimating = false;

                        if (status !== 'ongoing') {
                            this.transitionTo(GameState.GAME_OVER);
                        } else {
                            this.transitionTo(GameState.PLAYER_TURN);
                        }
                    };

                    setTimeout(finalizeTurn, Config.timing.turnDelayMs / Config.timing.gameSpeedMultiplier);

                }, Config.timing.aiThinkingTimeMs / Config.timing.gameSpeedMultiplier);
            }, flipWait);
        };

        executeTurn();
    }

    private handleAutoPlayerTurn() {
        if (!this.match || this.isAnimating) return;

        const executeTurn = () => {
            if (!this.match) return;

            if (this.isPaused) {
                setTimeout(executeTurn, 100);
                return;
            }

            this.isAnimating = true;

            const flipWait = Config.timing.boardFlipWaitMs / Config.timing.gameSpeedMultiplier;
            setTimeout(() => {
                setTimeout(() => {
                    if (!this.match) return;

                    if (this.isPaused) {
                        this.isAnimating = false;
                        executeTurn();
                        return;
                    }

                    const target = this.playerAIEngine.computeNextMove(this.match.enemyBoard, this.match);

                    const result = this.match.enemyBoard.receiveAttack(target.x, target.z);

                    this.playerAIEngine.reportResult(target.x, target.z, result.toString(), this.match.enemyBoard);

                    this.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), true, false));

                    const finalizeTurn = () => {
                        if (this.isPaused) {
                            setTimeout(finalizeTurn, 100);
                            return;
                        }

                        let status: 'ongoing' | 'player_wins' | 'enemy_wins' = 'ongoing';
                    try {
                        status = this.match!.checkGameEnd();
                    } catch (e: any) {
                        if (e.message === 'Board has no ships') {
                            document.dispatchEvent(new CustomEvent('EXIT_GAME'));
                            return;
                        }
                        throw e;
                    }
                        this.isAnimating = false;

                        if (status !== 'ongoing') {
                            this.transitionTo(GameState.GAME_OVER);
                        } else {
                            this.transitionTo(GameState.ENEMY_TURN);
                        }
                    };

                    setTimeout(finalizeTurn, Config.timing.turnDelayMs / Config.timing.gameSpeedMultiplier);

                }, Config.timing.aiThinkingTimeMs / Config.timing.gameSpeedMultiplier);
            }, flipWait);
        };

        executeTurn();
    }

    /**
     * External input hook (from 3D interactions and UI)
     */
    public onGridClick(x: number, z: number, isPlayerSide?: boolean) {
        if (!this.match || this.isPaused) return;

        if (this.currentState === GameState.SETUP_BOARD) {
            // Only allow placement on player board during setup
            if (isPlayerSide === false) return;
            if (this.playerShipsToPlace.length === 0) return;

            const nextShip = this.playerShipsToPlace[0];
            const isValid = this.match.validatePlacement(this.match.playerBoard, nextShip, x, z, this.currentPlacementOrientation);

            if (isValid) {
                const placed = this.match.playerBoard.placeShip(nextShip, x, z, this.currentPlacementOrientation);
                if (placed) {
                    this.playerShipsToPlace.shift();
                    this.shipPlacedListeners.forEach(l => l(nextShip, x, z, this.currentPlacementOrientation, true));

                    this.triggerAutoSave();

                    if (this.playerShipsToPlace.length === 0) {
                        this.transitionTo(GameState.PLAYER_TURN);
                    }
                }
            }

        } else if (this.currentState === GameState.PLAYER_TURN) {
            if (this.isAnimating || Config.autoBattler) return;
            
            // Only allow attacks on enemy board during player turn
            if (isPlayerSide === true) return;

            const result = this.match.enemyBoard.receiveAttack(x, z);

            if (result !== 'invalid') {
                this.attackResultListeners.forEach(l => l(x, z, result, true, false));

                this.isAnimating = true;

                setTimeout(() => {
                    let status: 'ongoing' | 'player_wins' | 'enemy_wins' = 'ongoing';
                    try {
                        status = this.match!.checkGameEnd();
                    } catch (e: any) {
                        if (e.message === 'Board has no ships') {
                            document.dispatchEvent(new CustomEvent('EXIT_GAME'));
                            return;
                        }
                        throw e;
                    }
                    this.isAnimating = false;

                    if (status !== 'ongoing') {
                        this.transitionTo(GameState.GAME_OVER);
                    } else {
                        this.transitionTo(GameState.ENEMY_TURN);
                    }
                }, Config.timing.turnDelayMs / Config.timing.gameSpeedMultiplier);
            }
        }
    }
}
