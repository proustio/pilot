import { Match } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { CellState } from '../../domain/board/Board';
import { AIEngine } from '../ai/AIEngine';
import { getCoords } from '../../domain/board/BoardUtils';
import { GameState } from './GameLoop';

type ShipPlacedListener = (ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) => void;
type AttackResultListener = (x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean) => void;

export interface MatchSetupState {
    match: Match | null;
    playerShipsToPlace: Ship[];
    aiEngine: AIEngine;
    playerAIEngine: AIEngine;
    shipPlacedListeners: ShipPlacedListener[];
    attackResultListeners: AttackResultListener[];
    transitionTo: (state: GameState) => void;
    config: {
        autoBattler: boolean;
    };
}

/**
 * Handles match initialisation (new game and loaded game) and replay of
 * prior game state (ships + attacks) for the 3-D presentation layer.
 */
export class MatchSetup {
    private state: MatchSetupState;

    constructor(state: MatchSetupState) {
        this.state = state;
    }

    /**
     * Starts a brand-new match, placing enemy ships randomly and optionally
     * auto-placing the player's fleet when Auto-Battler is active.
     */
    public startNewMatch(match: Match): void {
        this.state.match = match;
        this.state.aiEngine.reset();
        this.state.playerAIEngine.reset();

        this.state.playerShipsToPlace = match.getRequiredFleet();

        if (this.state.config.autoBattler) {
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
                            this.state.shipPlacedListeners.forEach(l => l(ship, x, z, orient, true));
                        }
                    }
                    attempts++;
                }
            }
            this.state.playerShipsToPlace = [];
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
                        this.state.shipPlacedListeners.forEach(l => l(ship, x, z, orient, false));
                    }
                }
                attempts++;
            }
        }

        if (this.state.playerShipsToPlace.length === 0) {
            this.state.transitionTo(GameState.PLAYER_TURN);
        } else {
            this.state.transitionTo(GameState.SETUP_BOARD);
        }
    }

    /**
     * Resumes an existing saved match by replaying all ship placements and
     * attack results, then transitioning straight to PLAYER_TURN.
     */
    public loadMatch(match: Match): void {
        this.state.match = match;

        this.replayShips(match);
        this.replayAttacks(match);

        this.state.transitionTo(GameState.PLAYER_TURN);
    }

    /**
     * Fires onShipPlaced for every already-placed ship in both boards so
     * EntityManager can spawn the 3-D meshes for a loaded game.
     */
    private replayShips(match: Match): void {
        for (const ship of match.playerBoard.ships) {
            if (ship.isPlaced) {
                this.state.shipPlacedListeners.forEach(l =>
                    l(ship, ship.headX, ship.headZ, ship.orientation as Orientation, true)
                );
            }
        }
        for (const ship of match.enemyBoard.ships) {
            if (ship.isPlaced) {
                this.state.shipPlacedListeners.forEach(l =>
                    l(ship, ship.headX, ship.headZ, ship.orientation as Orientation, false)
                );
            }
        }
    }

    /**
     * Fires onAttackResult for every Hit/Miss/Sunk cell in both boards.
     * isReplay=true lets the presentation layer place markers instantly.
     */
    private replayAttacks(match: Match): void {
        const resultMap: Record<number, string> = {
            [CellState.Hit]: 'hit',
            [CellState.Miss]: 'miss',
            [CellState.Sunk]: 'sunk',
        };

        match.playerBoard.gridState.forEach((cell, index) => {
            const result = resultMap[cell];
            if (result) {
                const { x, z } = getCoords(index, match.playerBoard.width);
                this.state.attackResultListeners.forEach(l => l(x, z, result, false, true));
            }
        });

        match.enemyBoard.gridState.forEach((cell, index) => {
            const result = resultMap[cell];
            if (result) {
                const { x, z } = getCoords(index, match.enemyBoard.width);
                this.state.attackResultListeners.forEach(l => l(x, z, result, true, true));
            }
        });
    }
}
