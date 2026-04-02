import { Match, MatchMode } from '../../domain/match/Match';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { CellState } from '../../domain/board/Board';
import { AIEngine } from '../ai/AIEngine';
import { getCoords } from '../../domain/board/BoardUtils';
import { GameState } from './GameLoop';
import { Config } from '../../infrastructure/config/Config';

type ShipPlacedListener = (ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) => void;
type AttackResultListener = (x: number, z: number, result: string, isPlayer: boolean, isReplay: boolean) => void;

export interface MatchSetupState {
    match: Match | null;
    playerShipsToPlace: Ship[];
    activeRogueShipIndex: number;
    activeEnemyRogueShipIndex: number;
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
        this.state.playerShipsToPlace = []; // Clear any previous state

        // Reset global resources
        Ship.resources = { airStrikes: 1, sonars: 2, mines: 5 };

        this.state.playerShipsToPlace = match.getRequiredFleet('player-');
        this.state.playerShipsToPlace.forEach(s => s.isEnemy = false);

        if (this.state.config.autoBattler) {
            const isRogue = match.mode === MatchMode.Rogue;
            const playerTargetBoard = isRogue ? match.sharedBoard : match.playerBoard;
            const playerShips = match.getRequiredFleet('player-');
            for (const ship of playerShips) {
                ship.isEnemy = false;
                let placed = false;
                let attempts = 0;
                while (!placed && attempts < 1000) {
                    let x, z, orient;
                    if (isRogue) {
                        // Player Top-Left 7x7
                        x = Math.floor(Math.random() * 7);
                        z = Math.floor(Math.random() * 7);
                        orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;
                    } else {
                        x = Math.floor(Math.random() * playerTargetBoard.width);
                        z = Math.floor(Math.random() * playerTargetBoard.height);
                        orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;
                    }

                    if (match.validatePlacement(playerTargetBoard, ship, x, z, orient)) {
                        placed = playerTargetBoard.placeShip(ship, x, z, orient);
                        if (placed) {
                            this.state.shipPlacedListeners.forEach(l => l(ship, x, z, orient, true));
                        }
                    }
                    attempts++;
                }
            }
            this.state.playerShipsToPlace = [];
        }

        // Always place enemy fleet
        const targetBoard = match.mode === MatchMode.Rogue ? match.sharedBoard : match.enemyBoard;
        const enemyShips = match.getRequiredFleet('enemy-');
        for (const ship of enemyShips) {
            ship.isEnemy = true;
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 1000) {
                let x, z;
                if (match.mode === MatchMode.Rogue) {
                    // Enemy Bottom-Right 7x7
                    x = 13 + Math.floor(Math.random() * 7);
                    z = 13 + Math.floor(Math.random() * 7);
                } else {
                    x = Math.floor(Math.random() * targetBoard.width);
                    z = Math.floor(Math.random() * targetBoard.height);
                }
                const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;

                if (match.validatePlacement(targetBoard, ship, x, z, orient)) {
                    placed = targetBoard.placeShip(ship, x, z, orient);
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
    public loadMatch(
        match: Match,
        resources?: { airStrikes: number; sonars: number; mines: number },
        activeRogueShipIndex?: number,
        activeEnemyRogueShipIndex?: number
    ): void {
        this.state.match = match;

        // Restore global resources if available
        if (resources) {
            Ship.resources = { ...resources };
        }

        // Restore active rogue indices
        if (activeRogueShipIndex !== undefined) {
            this.state.activeRogueShipIndex = activeRogueShipIndex;
        }
        if (activeEnemyRogueShipIndex !== undefined) {
            this.state.activeEnemyRogueShipIndex = activeEnemyRogueShipIndex;
        }

        this.replayShips(match);
        this.replayAttacks(match);

        this.state.transitionTo(GameState.PLAYER_TURN);
    }

    /**
     * Fires onShipPlaced for every already-placed ship in both boards so
     * EntityManager can spawn the 3-D meshes for a loaded game.
     */
    private replayShips(match: Match): void {
        const boardsToReplay = match.mode === MatchMode.Rogue ? [match.sharedBoard] : [match.playerBoard, match.enemyBoard];

        boardsToReplay.forEach(board => {
            const isBoardForPlayer = board === match.playerBoard;
            for (const ship of board.ships) {
                if (ship.isPlaced) {
                    // For Rogue mode, isPlayer means "is it a friendly unit/placed by player"
                    const isPlayer = match.mode === MatchMode.Rogue ? (!ship.isEnemy) : isBoardForPlayer;
                    this.state.shipPlacedListeners.forEach(l =>
                        l(ship, ship.headX, ship.headZ, ship.orientation as Orientation, isPlayer)
                    );
                }
            }
        });
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

        if (match.mode === MatchMode.Rogue) {
            match.sharedBoard.gridState.forEach((cell, index) => {
                const result = resultMap[cell];
                if (result) {
                    const { x, z } = getCoords(index, match.sharedBoard.width);
                    // In Rogue mode, we use the quadrants to infer isPlayer.
                    // Player territory is 0-6, so attacks on it are AI (isPlayer=false).
                    // AI territory is Config.board.width-7 to Config.board.width, 
                    // so attacks on it are Player (isPlayer=true).
                    const enemyOffsetWidth = Config.board.width - 7;
                    const enemyOffsetHeight = Config.board.height - 7;
                    const isPlayerShot = x >= enemyOffsetWidth && z >= enemyOffsetHeight;
                    this.state.attackResultListeners.forEach(l => l(x, z, result, isPlayerShot, true));
                }
            });
        } else {
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
}
