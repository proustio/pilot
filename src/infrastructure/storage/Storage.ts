import { Match, MatchMode } from '../../domain/match/Match';
import { Board } from '../../domain/board/Board';
import { Ship, Orientation } from '../../domain/fleet/Ship';
import { Config } from '../config/Config';

export interface SaveMetadata {
    mode: string;
    date: string;
    turnCount: number;
}

export interface ViewState {
    cameraX: number;
    cameraY: number;
    cameraZ: number;
    cameraDist?: number;
    targetX: number;
    targetY: number;
    targetZ: number;
    boardOrientation: 'player' | 'enemy';
    isDayMode: boolean;
    gameSpeedMultiplier: number;
    gameState: string;
}

export interface LoadedGame {
    match: Match;
    viewState: ViewState | null;
}

interface ShipData {
    id: string;
    size: number;
    orientation: string;
    headX: number;
    headZ: number;
    segments: boolean[];
    isPlaced: boolean;
    isEnemy?: boolean;
    isSpecialWeapon?: boolean;
    specialType?: 'mine' | 'sonar';
    visionRadius?: number;
    movesRemaining?: number;
    hasActedThisTurn?: boolean;
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
    viewState?: ViewState;
    resources?: {
        airStrikes: number;
        sonars: number;
        mines: number;
    };
    activeRogueShipIndex?: number;
    activeEnemyRogueShipIndex?: number;
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
            isPlaced: ship.isPlaced,
            isEnemy: ship.isEnemy,
            isSpecialWeapon: ship.isSpecialWeapon,
            specialType: ship.specialType,
            visionRadius: ship.visionRadius,
            movesRemaining: ship.movesRemaining,
            hasActedThisTurn: ship.hasActedThisTurn
        };
    }

    private static deserialiseShip(data: ShipData): Ship {
        const ship = new Ship(data.id, data.size);
        ship.segments = [...data.segments];
        if (data.isPlaced) {
            ship.placeCoordinate(data.headX, data.headZ, data.orientation as Orientation);
        }
        if (data.movesRemaining !== undefined) ship.movesRemaining = data.movesRemaining;
        if (data.hasActedThisTurn !== undefined) ship.hasActedThisTurn = data.hasActedThisTurn;
        if (data.isEnemy !== undefined) ship.isEnemy = data.isEnemy;
        if (data.isSpecialWeapon !== undefined) ship.isSpecialWeapon = data.isSpecialWeapon;
        if (data.specialType !== undefined) ship.specialType = data.specialType;
        if (data.visionRadius !== undefined) ship.visionRadius = data.visionRadius;
        
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
        board.gridState.set(data.gridState);
        board.shotsFired = data.shotsFired;
        board.hits = data.hits;

        for (const shipData of data.ships) {
            const ship = Storage.deserialiseShip(shipData);
            board.ships.push(ship);

            if (ship.isPlaced) {
                if (!ship.isSunk() && !ship.isSpecialWeapon) {
                    board.aliveShipsCount++;
                }
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
     * Serializes the current Match state and optional view/camera state.
     */
    public static saveGame(
        slotId: number | 'session', 
        match: Match, 
        viewState?: ViewState,
        activeRogueShipIndex?: number,
        activeEnemyRogueShipIndex?: number
    ): boolean {
        if (typeof slotId === 'number' && (slotId < 1 || slotId > Config.storage.maxSlots)) return false;

        const key = slotId === 'session' ? 'battleships_session' : `${Config.storage.prefix}${slotId}`;

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
                enemyBoard: Storage.serialiseBoard(match.enemyBoard),
                viewState,
                resources: { ...Ship.resources },
                activeRogueShipIndex,
                activeEnemyRogueShipIndex
            };

            localStorage.setItem(key, JSON.stringify(saveData));
            return true;
        } catch (e) {
            console.error('Failed to save game', e);
            return false;
        }
    }

    /**
     * Loads a Match + optional ViewState from localStorage.
     */
    public static loadGame(slotId: number | 'session'): (LoadedGame & { 
        resources?: { airStrikes: number; sonars: number; mines: number };
        activeRogueShipIndex?: number;
        activeEnemyRogueShipIndex?: number;
    }) | null {
        const key = slotId === 'session' ? 'battleships_session' : `${Config.storage.prefix}${slotId}`;
        const data = localStorage.getItem(key);

        if (!data) return null;

        try {
            const parsed: SaveData = JSON.parse(data);

            const match = new Match(parsed.mode as MatchMode, Config.board.width, Config.board.height);
            (match as any).playerBoard = Storage.deserialiseBoard(parsed.playerBoard);
            (match as any).enemyBoard = Storage.deserialiseBoard(parsed.enemyBoard);

            return { 
                match, 
                viewState: parsed.viewState ?? null,
                resources: parsed.resources,
                activeRogueShipIndex: parsed.activeRogueShipIndex,
                activeEnemyRogueShipIndex: parsed.activeEnemyRogueShipIndex
            };
        } catch (e) {
            console.error('Failed to load game', e);
            return null;
        }
    }

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

    public static clearSession(): void {
        localStorage.removeItem('battleships_session');
    }
}
