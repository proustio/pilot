import { Match } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { AIEngine, AIDifficulty } from '../ai/AIEngine';
import { Config } from '../../infrastructure/config/Config';

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
    public aiEngine: AIEngine;
    public playerAIEngine: AIEngine;

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

        // Listen for Auto-Battler toggling
        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail !== undefined) {
                if (Config.autoBattler && this.currentState === GameState.PLAYER_TURN && !this.isAnimating) {
                    this.handleAutoPlayerTurn();
                }
            }
        });
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
     * Resumes an existing match
     */
    public loadMatch(match: Match) {
        this.match = match;
        // Determine state based on match logic, for now default to Player Turn
        this.transitionTo(GameState.PLAYER_TURN);
    }

    private handleEnemyTurn() {
        if (!this.match) return;

        console.log(`Enemy is thinking... (Difficulty: ${this.aiEngine.difficulty})`);
        this.isAnimating = true;

        setTimeout(() => {
            if (!this.match) return;
            
            // Ask AI Engine for next move
            const target = this.aiEngine.computeNextMove(this.match.playerBoard, this.match);
            
            // Perform Attack
            const result = this.match.playerBoard.receiveAttack(target.x, target.z);
            
            // Report result back to AI so it can learn (for Normal/Hard modes)
            this.aiEngine.reportResult(target.x, target.z, result.toString(), this.match.playerBoard);
            
            // Show the result maker
            this.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), false));
            
            // Wait 2000ms for player to see what happened before flipping board
            setTimeout(() => {
                // Re-evaluate game over
                const status = this.match!.checkGameEnd();
                this.isAnimating = false;
                
                if (status !== 'ongoing') {
                    this.transitionTo(GameState.GAME_OVER);
                } else {
                    this.transitionTo(GameState.PLAYER_TURN);
                }
            }, 2000);
            
        }, 1000); // 1s thinking time
    }

    private handleAutoPlayerTurn() {
        if (!this.match || this.isAnimating) return;

        console.log(`Auto-Battler is thinking...`);
        this.isAnimating = true;

        setTimeout(() => {
            if (!this.match) return;
            
            // Ask Player AI Engine for next move against Enemy Board
            const target = this.playerAIEngine.computeNextMove(this.match.enemyBoard, this.match);
            
            // Perform Attack
            const result = this.match.enemyBoard.receiveAttack(target.x, target.z);
            
            // Report result back to AI so it can learn
            this.playerAIEngine.reportResult(target.x, target.z, result.toString(), this.match.enemyBoard);
            
            // Show the result maker
            this.attackResultListeners.forEach(l => l(target.x, target.z, result.toString(), true));
            
            // Wait 2000ms for player to see what happened before flipping board
            setTimeout(() => {
                // Re-evaluate game over
                const status = this.match!.checkGameEnd();
                this.isAnimating = false;
                
                if (status !== 'ongoing') {
                    this.transitionTo(GameState.GAME_OVER);
                } else {
                    this.transitionTo(GameState.ENEMY_TURN);
                }
            }, 2000);
            
        }, 1000); // 1s thinking time
    }

    /**
     * External input hook (from 3D interactions)
     */
    public onGridClick(x: number, z: number) {
        if (!this.match) return;

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

                // Wait 2000ms for player to see what happened before flipping board
                setTimeout(() => {
                    // Successful action, check if game ended
                    const status = this.match!.checkGameEnd();
                    this.isAnimating = false;
                    
                    if (status !== 'ongoing') {
                        this.transitionTo(GameState.GAME_OVER);
                    } else {
                        this.transitionTo(GameState.ENEMY_TURN);
                    }
                }, 2000);
            }
        }
    }
}
