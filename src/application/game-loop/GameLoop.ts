import { Match } from '../../domain/match/Match';

export enum GameState {
    MAIN_MENU = 'MAIN_MENU',
    SETUP_BOARD = 'SETUP_BOARD',
    PLAYER_TURN = 'PLAYER_TURN',
    ENEMY_TURN = 'ENEMY_TURN',
    GAME_OVER = 'GAME_OVER'
}

type StateChangeListener = (newState: GameState, oldState: GameState) => void;

export class GameLoop {
    public currentState: GameState = GameState.MAIN_MENU;
    public match: Match | null = null;
    
    private listeners: StateChangeListener[] = [];

    constructor() {}

    /**
     * Subscribe to state transition events (for UI / 3D to react)
     */
    public onStateChange(listener: StateChangeListener) {
        this.listeners.push(listener);
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
            // Fake AI: just fire back to transition. In Phase 7 this will be real.
            console.log('Enemy fired!');
            
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
            // Setup placement logic handled here or delegated to UI
            console.log(`Clicked to place ship at ${x},${z}`);
        } else if (this.currentState === GameState.PLAYER_TURN) {
            // Resolve Attack
            console.log(`Player attacking enemy grid at ${x},${z}`);
            const result = this.match.enemyBoard.receiveAttack(x, z);
            
            if (result !== 'invalid') {
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
