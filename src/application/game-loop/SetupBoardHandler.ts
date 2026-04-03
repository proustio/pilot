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
        const orientation = this.s.currentPlacementOrientation;

        // Click is the bow — derive head (stern, segment-0) from it
        const s = nextShip.size - 1;
        let headX = x, headZ = z;
        if (orientation === Orientation.Horizontal) headX = x - s;
        else if (orientation === Orientation.Vertical) headZ = z - s;
        else if (orientation === Orientation.Left) headX = x + s;
        else if (orientation === Orientation.Up) headZ = z + s;

        const isValid = this.s.match.validatePlacement(
            targetBoard, nextShip, headX, headZ, orientation
        );

        if (isValid) {
            const placed = targetBoard.placeShip(nextShip, headX, headZ, orientation);
            if (placed) {
                this.s.playerShipsToPlace.shift();
                this.s.shipPlacedListeners.forEach(l =>
                    l(nextShip, headX, headZ, orientation, true)
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
