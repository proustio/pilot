import { Orientation } from '../../domain/fleet/Ship';
import { MatchMode } from '../../domain/match/Match';
import { Config } from '../../infrastructure/config/Config';
import { GameState } from './GameLoop';
import { TurnExecutorState } from './TurnExecutor';

/**
 * Handles ship placement during the SETUP_BOARD phase.
 * Extracted from TurnExecutor to isolate setup-board click logic.
 */
export class SetupBoardHandler {
    private s: TurnExecutorState;

    constructor(state: TurnExecutorState) {
        this.s = state;
    }

    public handleClick(x: number, z: number, _isPlayerSide?: boolean): void {
        if (!this.s.match || this.s.isPaused) return;
        if (this.s.playerShipsToPlace.length === 0) return;

        const isRogue = this.s.match.mode === MatchMode.Rogue;
        const nextShip = this.s.playerShipsToPlace[0];
        const targetBoard = isRogue ? this.s.match.sharedBoard : this.s.match.playerBoard;

        const isValid = this.s.match.validatePlacement(
            targetBoard, nextShip, x, z, this.s.currentPlacementOrientation
        );

        if (isValid) {
            const placed = targetBoard.placeShip(nextShip, x, z, this.s.currentPlacementOrientation);
            if (placed) {
                this.s.playerShipsToPlace.shift();
                this.s.shipPlacedListeners.forEach(l =>
                    l(nextShip, x, z, this.s.currentPlacementOrientation, true)
                );
                this.s.requestAutoSave();

                if (this.s.playerShipsToPlace.length === 0) {
                    if (this.s.match.mode === MatchMode.Rogue) {
                        this.placeEnemyShipsRogue();
                    }
                    this.s.transitionTo(GameState.PLAYER_TURN);
                }
            }
        }
    }

    private placeEnemyShipsRogue(): void {
        const enemyShips = this.s.match!.getRequiredFleet();
        const sharedBoard = this.s.match!.sharedBoard;
        for (const ship of enemyShips) {
            ship.isEnemy = true;
            let placed = false;
            let attempts = 0;
            while (!placed && attempts < 1000) {
                const orient = Math.random() > 0.5 ? Orientation.Horizontal : Orientation.Vertical;
                const maxX = Config.board.width - (orient === Orientation.Horizontal ? ship.size : 1);
                const maxZ = Config.board.width - (orient === Orientation.Vertical ? ship.size : 1);

                const rx = 13 + Math.floor(Math.random() * (maxX - 13 + 1));
                const rz = 13 + Math.floor(Math.random() * (maxZ - 13 + 1));

                if (this.s.match!.validatePlacement(sharedBoard, ship, rx, rz, orient)) {
                    placed = sharedBoard.placeShip(ship, rx, rz, orient);
                    if (placed) {
                        this.s.shipPlacedListeners.forEach(l => l(ship, rx, rz, orient, false));
                    }
                }
                attempts++;
            }
        }
    }
}
