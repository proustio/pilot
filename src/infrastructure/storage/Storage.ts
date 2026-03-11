import { Match, MatchMode } from '../../domain/match/Match';
import { Board } from '../../domain/board/Board';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { Config } from '../config/Config';

export interface SaveMetadata {
    mode: string;
    date: string;
    turnCount: number;
}

interface ShipData {
    id: string;
    size: number;
    orientation: string;
    headX: number;
    headZ: number;
    segments: boolean[];
    isPlaced: boolean;
}

interface BoardData {
    width: number;
    height: number;
    gridState: number[];
    ships: ShipData[];
    shotsFired: number;
    hits: number;
}

interface SaveData {
    metadata: SaveMetadata;
    mode: string;
    playerBoard: BoardData;
    enemyBoard: BoardData;
}

export class Storage {

    private static serialiseShip(ship: Ship): ShipData {
        return {
            id: ship.id,
            size: ship.size,
            orientation: ship.orientation,
            headX: ship.headX,
            headZ: ship.headZ,
            segments: [...ship.segments],
            isPlaced: ship.isPlaced
        };
    }

    private static deserialiseShip(data: ShipData): Ship {
        const ship = new Ship(data.id, data.size);
        ship.segments = [...data.segments];
        if (data.isPlaced) {
            ship.placeCoordinate(data.headX, data.headZ, data.orientation as Orientation);
        }
        return ship;
    }

    private static serialiseBoard(board: Board): BoardData {
        return {
            width: board.width,
            height: board.height,
            gridState: [...board.gridState],
            ships: board.ships.map(s => Storage.serialiseShip(s)),
            shotsFired: board.shotsFired,
            hits: board.hits
        };
    }

    private static deserialiseBoard(data: BoardData): Board {
        const board = new Board(data.width, data.height);
        board.gridState = [...data.gridState];
        board.shotsFired = data.shotsFired;
        board.hits = data.hits;

        // Reconstruct ships and rebuild shipMap via placement
        for (const shipData of data.ships) {
            const ship = Storage.deserialiseShip(shipData);
            board.ships.push(ship);

            // Rebuild the internal shipMap by iterating occupied coordinates
            if (ship.isPlaced) {
                const coords = ship.getOccupiedCoordinates();
                coords.forEach((coord, segmentIndex) => {
                    const mapKey = `${coord.x},${coord.z}`;
                    (board as any).shipMap.set(mapKey, { ship, segmentIndex });
                });
            }
        }

        return board;
    }

    /**
     * Serializes the current Match state and saves it to localStorage.
     * @param slotId 1, 2, or 3
     * @param match Current Match instance
     */
    public static saveGame(slotId: number, match: Match): boolean {
        if (slotId < 1 || slotId > Config.storage.maxSlots) return false;

        const key = `${Config.storage.prefix}${slotId}`;

        try {
            const totalShots = match.playerBoard.shotsFired + match.enemyBoard.shotsFired;

            const saveData: SaveData = {
                metadata: {
                    mode: match.mode,
                    date: new Date().toISOString(),
                    turnCount: totalShots
                },
                mode: match.mode,
                playerBoard: Storage.serialiseBoard(match.playerBoard),
                enemyBoard: Storage.serialiseBoard(match.enemyBoard)
            };

            localStorage.setItem(key, JSON.stringify(saveData));
            return true;
        } catch (e) {
            console.error('Failed to save game', e);
            return false;
        }
    }

    /**
     * Loads a Match state from localStorage with fully reconstructed objects.
     * @param slotId 1, 2, or 3
     */
    public static loadGame(slotId: number): Match | null {
        const key = `${Config.storage.prefix}${slotId}`;
        const data = localStorage.getItem(key);

        if (!data) return null;

        try {
            const parsed: SaveData = JSON.parse(data);

            const match = new Match(parsed.mode as MatchMode);
            // Replace the default empty boards with deserialised ones
            (match as any).playerBoard = Storage.deserialiseBoard(parsed.playerBoard);
            (match as any).enemyBoard = Storage.deserialiseBoard(parsed.enemyBoard);

            return match;
        } catch (e) {
            console.error('Failed to load game', e);
            return null;
        }
    }

    /**
     * Returns metadata for a specific slot, or null if empty/corrupt.
     */
    public static getSlotMetadata(slotId: number): SaveMetadata | null {
        const key = `${Config.storage.prefix}${slotId}`;
        const data = localStorage.getItem(key);
        if (!data) return null;

        try {
            const parsed: SaveData = JSON.parse(data);
            return parsed.metadata;
        } catch {
            return null;
        }
    }

    public static hasSave(slotId: number): boolean {
        const key = `${Config.storage.prefix}${slotId}`;
        return localStorage.getItem(key) !== null;
    }

    public static clearSave(slotId: number): void {
        const key = `${Config.storage.prefix}${slotId}`;
        localStorage.removeItem(key);
    }
}
