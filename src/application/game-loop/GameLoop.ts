import { Match } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';

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

    private listeners: StateChangeListener[] = [];
    private shipPlacedListeners: ShipPlacedListener[] = [];
    private attackResultListeners: AttackResultListener[] = [];

    constructor() {}

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
        }
    }

    /**
     * Initializes a brand new match logic and enters SETUP state.
     */
    public startNewMatch(match: Match) {
        this.match = match;
        
        // Setup fleets
        this.playerShipsToPlace = match.getRequiredFleet();
        
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

        this.transitionTo(GameState.SETUP_BOARD);
    }
    
    /**
     * Resumes an existing match
     */
    public loadMatch(match: Match) {
        this.match = match;
        // Determine state based on match logic, for now default to Player Turn
        this.transitionTo(GameState.PLAYER_TURN);
    }

    /**
     * Orchestration logic when it's the Enemy's turn.
     * Normally delegates to AIEngine here.
     */
    private handleEnemyTurn() {
        if (!this.match) return;

        // Placeholder: Enemy AI will pick a spot here
        console.log('Enemy is thinking...');

        setTimeout(() => {
            if (!this.match) return;
            // Fake AI: random fire
            let result = 'invalid';
            let x = 0;
            let z = 0;
            while (result === 'invalid') {
                x = Math.floor(Math.random() * this.match.playerBoard.width);
                z = Math.floor(Math.random() * this.match.playerBoard.height);
                result = this.match.playerBoard.receiveAttack(x, z);
            }
            
            this.attackResultListeners.forEach(l => l(x, z, result, false));
            
            // Re-evaluate game over
            const status = this.match!.checkGameEnd();
            if (status !== 'ongoing') {
                this.transitionTo(GameState.GAME_OVER);
            } else {
                this.transitionTo(GameState.PLAYER_TURN);
            }
        }, 1000);
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
            console.log(`Player attacking enemy grid at ${x},${z}`);
            const result = this.match.enemyBoard.receiveAttack(x, z);
            
            if (result !== 'invalid') {
                this.attackResultListeners.forEach(l => l(x, z, result, true));
                
                // Successful action, check if game ended
                const status = this.match.checkGameEnd();
                if (status !== 'ongoing') {
                    this.transitionTo(GameState.GAME_OVER);
                } else {
                    this.transitionTo(GameState.ENEMY_TURN);
                }
            }
        }
    }
}
