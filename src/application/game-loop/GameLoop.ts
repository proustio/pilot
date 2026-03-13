import { Match } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { AIEngine, AIDifficulty } from '../ai/AIEngine';
import { Config } from '../../infrastructure/config/Config';
import { Storage, ViewState } from '../../infrastructure/storage/Storage';

export enum GameState {
    MAIN_MENU = 'MAIN_MENU',
    SETUP_BOARD = 'SETUP_BOARD',
    PLAYER_TURN = 'PLAYER_TURN',
    ENEMY_TURN = 'ENEMY_TURN',
    GAME_OVER = 'GAME_OVER'
}

type StateChangeListener = (newState: GameState, oldState: GameState) => void;
type ShipPlacedListener = (ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) => void;
type AttackResultListener = (x: number, z: number, result: string, isPlayer: boolean) => void;

export class GameLoop {
    public currentState: GameState = GameState.MAIN_MENU;
    public match: Match | null = null;
    
    public playerShipsToPlace: Ship[] = [];
    public currentPlacementOrientation: Orientation = Orientation.Horizontal;
    public isAnimating: boolean = false;
    public isPaused: boolean = false;
    public aiEngine: AIEngine;
    public playerAIEngine: AIEngine;
    public loadedViewState: ViewState | null = null;

    private listeners: StateChangeListener[] = [];
    private shipPlacedListeners: ShipPlacedListener[] = [];
    private attackResultListeners: AttackResultListener[] = [];

    constructor() {
        this.aiEngine = new AIEngine();
        this.playerAIEngine = new AIEngine();
        
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
                console.log(`Game Speed set to ${Config.timing.gameSpeedMultiplier}x`);
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

        // Listen for Save/Load events
        document.addEventListener('SAVE_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            const slotId = ce.detail?.slotId;
            const viewState: ViewState | undefined = ce.detail?.viewState;
            if (slotId && this.match) {
                const success = Storage.saveGame(slotId, this.match, viewState);
                console.log(success ? `Game saved to slot ${slotId}` : `Failed to save to slot ${slotId}`);
            }
        });

        document.addEventListener('LOAD_GAME', (e: Event) => {
            const ce = e as CustomEvent;
            const slotId = ce.detail?.slotId;
            if (slotId) {
                const match = Storage.loadGame(slotId);
                if (match) {
                    console.log(`Game loaded from slot ${slotId}`);
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
     * Executes a state transition and notifies all subscribers.
     */
    public transitionTo(newState: GameState) {
        if (this.currentState === newState) return;
        
        const oldState = this.currentState;
        this.currentState = newState;
        
        // Broadcast
        this.listeners.forEach(listener => listener(newState, oldState));
        
        // Handle automated state triggers
        if (newState === GameState.ENEMY_TURN) {
            this.handleEnemyTurn();
        } else if (newState === GameState.PLAYER_TURN && Config.autoBattler) {
            this.handleAutoPlayerTurn();
        }
    }

    /**
     * Initializes a brand new match logic and enters SETUP state.
     */
    public startNewMatch(match: Match) {
        this.match = match;
        this.aiEngine.reset();
        this.playerAIEngine.reset();
        
        // Setup fleets
        this.playerShipsToPlace = match.getRequiredFleet();
        
        // Auto-place player ships if Auto-Battler is ON initially
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
        
        // Auto-place enemy ships (temporary basic random placement)
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
     * Resumes an existing match, optionally restoring saved view state.
     */
    public loadMatch(match: Match, viewState?: ViewState | null) {
        this.match = match;
        this.loadedViewState = viewState ?? null;

        // Replay ship placement events so 3D entity meshes get spawned
        this.replayShips(match);

        this.transitionTo(GameState.PLAYER_TURN);
    }

    /**
     * Fires onShipPlaced for every already-placed ship in both boards.
     * This makes EntityManager spawn the 3D meshes for a loaded game.
     * Note: attack marker replay is handled separately via RESTORE_VIEW_STATE in main.ts
     * to allow instant fog clearing without reanimating old projectiles.
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

    private handleEnemyTurn() {
        if (!this.match) return;

        console.log(`Enemy is thinking... (Difficulty: ${this.aiEngine.difficulty})`);
        
        const executeTurn = () => {
            if (!this.match) return;
            
            if (this.isPaused) {
                setTimeout(executeTurn, 100);
                return;
            }

            this.isAnimating = true;

            // Wait for board flip to settle, then add thinking delay
            const flipWait = Config.timing.boardFlipWaitMs / Config.timing.gameSpeedMultiplier;
            setTimeout(() => {
                setTimeout(() => {
                    if (!this.match) return;
                    
                    // Re-check pause after delay
                    if (this.isPaused) {
                        this.isAnimating = false; // Reset so it can be re-triggered
                        executeTurn();
                        return;
                    }
                    
                    // Ask AI Engine for next move
                    const target = this.aiEngine.computeNextMove(this.match.playerBoard, this.match);
                    
                    // Perform Attack
                    const result = this.match.playerBoard.receiveAttack(target.x, target.z);
                    
                    // Report result back to AI so it can learn (for Normal/Hard modes)
                    this.aiEngine.reportResult(target.x, target.z, result.toString(), this.match.playerBoard);
                    
                    // Show the result maker
                    this.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), false));
                    
                    // Wait for player to see what happened before flipping board
                    const finalizeTurn = () => {
                        if (this.isPaused) {
                            setTimeout(finalizeTurn, 100);
                            return;
                        }
                        
                        // Re-evaluate game over
                        const status = this.match!.checkGameEnd();
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

        console.log(`Auto-Battler is thinking...`);
        
        const executeTurn = () => {
            if (!this.match) return;

            if (this.isPaused) {
                setTimeout(executeTurn, 100);
                return;
            }

            this.isAnimating = true;

            // Wait for board flip to settle, then add thinking delay
            const flipWait = Config.timing.boardFlipWaitMs / Config.timing.gameSpeedMultiplier;
            setTimeout(() => {
                setTimeout(() => {
                    if (!this.match) return;

                    // Re-check pause after delay
                    if (this.isPaused) {
                        this.isAnimating = false;
                        executeTurn();
                        return;
                    }
                    
                    // Ask Player AI Engine for next move against Enemy Board
                    const target = this.playerAIEngine.computeNextMove(this.match.enemyBoard, this.match);
                    
                    // Perform Attack
                    const result = this.match.enemyBoard.receiveAttack(target.x, target.z);
                    
                    // Report result back to AI so it can learn
                    this.playerAIEngine.reportResult(target.x, target.z, result.toString(), this.match.enemyBoard);
                    
                    // Show the result maker
                    this.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), true));
                    
                    // Wait for player to see what happened before flipping board
                    const finalizeTurn = () => {
                        if (this.isPaused) {
                            setTimeout(finalizeTurn, 100);
                            return;
                        }
                        
                        // Re-evaluate game over
                        const status = this.match!.checkGameEnd();
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
     * External input hook (from 3D interactions)
     */
    public onGridClick(x: number, z: number) {
        if (!this.match || this.isPaused) return;

        if (this.currentState === GameState.SETUP_BOARD) {
            if (this.playerShipsToPlace.length === 0) return;
            
            const nextShip = this.playerShipsToPlace[0];
            const isValid = this.match.validatePlacement(this.match.playerBoard, nextShip, x, z, this.currentPlacementOrientation);
            
            if (isValid) {
                const placed = this.match.playerBoard.placeShip(nextShip, x, z, this.currentPlacementOrientation);
                if (placed) {
                    this.playerShipsToPlace.shift(); // Remove from queue
                    this.shipPlacedListeners.forEach(l => l(nextShip, x, z, this.currentPlacementOrientation, true));
                    
                    if (this.playerShipsToPlace.length === 0) {
                        this.transitionTo(GameState.PLAYER_TURN);
                    }
                }
            } else {
                console.log(`Cannot place ship at ${x},${z} with orientation ${this.currentPlacementOrientation}`);
            }

        } else if (this.currentState === GameState.PLAYER_TURN) {
            if (this.isAnimating || Config.autoBattler) return; // Prevent spam clicking and manual play when auto-battler is on

            console.log(`Player attacking enemy grid at ${x},${z}`);
            const result = this.match.enemyBoard.receiveAttack(x, z);
            
            if (result !== 'invalid') {
                this.attackResultListeners.forEach(l => l(x, z, result, true));
                
                this.isAnimating = true;

                // Wait for player to see what happened before flipping board
                setTimeout(() => {
                    // Successful action, check if game ended
                    const status = this.match!.checkGameEnd();
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
