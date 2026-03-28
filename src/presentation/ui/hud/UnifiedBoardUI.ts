import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';
import { CellState } from '../../../domain/board/Board';
import { Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { TemplateEngine } from '../templates/TemplateEngine';
import unifiedBoardTemplate from '../templates/UnifiedBoardUI.html?raw';

export class UnifiedBoardUI extends BaseUIComponent {
    private gameLoop: GameLoop;
    private entityManager: any;
    private playerGridContainer!: HTMLElement;
    private enemyGridContainer!: HTMLElement;
    private lastHoveredKey: string | null = null;

    constructor(gameLoop: GameLoop, entityManager: any) {
        super('unified-board');
        this.gameLoop = gameLoop;
        this.entityManager = entityManager;

        this.gameLoop.onShipPlaced(() => this.refresh());
        this.gameLoop.onAttackResult((_x, _z, _result, _isPlayer, _isReplay) => this.refresh());
        this.gameLoop.onStateChange(() => this.refresh());

        eventBus.on(GameEventType.SET_ROGUE_WEAPON, (payload) => {
            (window as any).selectedRogueWeapon = payload.weapon;
            this.refresh();
        });

        eventBus.on(GameEventType.SET_ROGUE_ACTION_SECTION, (payload) => {
            (window as any).selectedRogueAction = payload.section;
            this.refresh();
        });

        eventBus.on(GameEventType.MOUSE_CELL_HOVER, (payload) => {
            this.handle3DHover(payload);
        });
        
        eventBus.on(GameEventType.ROGUE_ACTION_MODE_CHANGED, () => {
            this.refresh();
        });
        
        eventBus.on(GameEventType.ACTIVE_SHIP_CHANGED, () => {
            this.refresh();
        });
    }

    private handle3DHover(detail: any): void {
        const isRogue = Config.rogueMode;
        
        if (!detail) {
            if (this.lastHoveredKey !== null) {
                this.container.querySelectorAll('.mini-cell.highlight').forEach(el => el.classList.remove('highlight'));
                this.lastHoveredKey = null;
            }
            return;
        }

        const { x, z, isPlayerSide } = detail;
        const currentKey = `${x},${z},${isPlayerSide}`;
        
        if (this.lastHoveredKey === currentKey) return;
        this.lastHoveredKey = currentKey;

        // Clear all highlights
        this.container.querySelectorAll('.mini-cell.highlight').forEach(el => el.classList.remove('highlight'));
        
        const targetContainer = (isRogue || isPlayerSide) ? this.playerGridContainer : this.enemyGridContainer;
        if (!targetContainer) return;

        const cells = targetContainer.querySelectorAll('.mini-cell');
        const boardWidth = this.gameLoop.match ? (isRogue ? this.gameLoop.match.sharedBoard.width : this.gameLoop.match.playerBoard.width) : Config.board.width;
        
        const weapon = (window as any).selectedRogueWeapon;
        if (isRogue && (weapon === 'airstrike' || (weapon as any) === 'air-strike')) {
            const isVertical = this.gameLoop.airStrikeOrientation === Orientation.Vertical;
            const length = 10;
            const start = isVertical ? Math.max(0, z - 4) : Math.max(0, x - 4);
            const end = Math.min(boardWidth - 1, start + length - 1);

            for (let i = start; i <= end; i++) {
                const tx = isVertical ? x : i;
                const tz = isVertical ? i : z;
                const index = tz * boardWidth + tx;
                const cell = cells[index] as HTMLElement;
                if (cell) cell.classList.add('highlight');
            }
        } else {
            const index = z * boardWidth + x;
            const cell = cells[index] as HTMLElement;
            if (cell) cell.classList.add('highlight');
        }
    }

    protected render(): void {
        const isRogue = Config.rogueMode;
        this.container.innerHTML = TemplateEngine.render(unifiedBoardTemplate, { isRogue });

        this.playerGridContainer = this.container.querySelector('#mini-player-grid') as HTMLElement;
        this.enemyGridContainer = this.container.querySelector('#mini-enemy-grid') as HTMLElement;

        this.initGrids();
        this.refresh();
    }

    private initGrids(): void {
        const createGrid = (container: HTMLElement, isPlayer: boolean) => {
            container.innerHTML = '';
            const boardWidth = this.gameLoop.match ? this.gameLoop.match.playerBoard.width : Config.board.width;
            const boardHeight = this.gameLoop.match ? this.gameLoop.match.playerBoard.height : Config.board.height;
            const cellCount = boardWidth * boardHeight;

            container.style.gridTemplateColumns = `repeat(${boardWidth}, 8px)`;
            container.style.gridTemplateRows = `repeat(${boardHeight}, 8px)`;
            container.style.gap = '2px';
            
            for (let i = 0; i < cellCount; i++) {
                const cell = document.createElement('div');
                cell.classList.add('mini-cell');
                
                const x = i % boardWidth;
                const z = Math.floor(i / boardWidth);
                
                const onHover = (e: MouseEvent) => {
                    eventBus.emit(GameEventType.MOUSE_CELL_HOVER, {
                        x, z,
                        isPlayerSide: isPlayer,
                        source: '2d',
                        clientX: e.clientX,
                        clientY: e.clientY
                    });
                };
                
                cell.addEventListener('mouseenter', onHover);
                cell.addEventListener('mousemove', onHover);
                cell.addEventListener('mouseleave', () => {
                    eventBus.emit(GameEventType.MOUSE_CELL_HOVER, null);
                });

                cell.addEventListener('click', () => {
                    this.gameLoop.onGridClick(x, z, isPlayer);
                });

                container.appendChild(cell);
            }
        };

        createGrid(this.playerGridContainer, true);
        createGrid(this.enemyGridContainer, false);
    }

    public refresh(): void {
        if (!this.gameLoop.match) return;

        const isRogue = Config.rogueMode;
        if (isRogue) {
            // In Rogue mode, only the "BATTLEFIELD" (playerGridContainer) is shown.
            // It displays the sharedBoard (which is now enemyBoard).
            this.updateGrid(this.playerGridContainer, this.gameLoop.match.sharedBoard.gridState, true);
        } else {
            this.updateGrid(this.playerGridContainer, this.gameLoop.match.playerBoard.gridState, true);
            this.updateGrid(this.enemyGridContainer, this.gameLoop.match.enemyBoard.gridState, false);
        }
    }

    private updateGrid(container: HTMLElement, gridState: Uint8Array, isPlayer: boolean): void {
        const cells = container.querySelectorAll('.mini-cell');
        const boardWidth = this.gameLoop.match?.playerBoard.width || Config.board.width;
        
        const isRogue = Config.rogueMode;
        const currentActionMode = (window as any).selectedRogueAction || 'move';
        let moveRadiusSet = new Set<number>();

        if (isRogue && isPlayer && currentActionMode === 'move') {
            const index = this.gameLoop.activeRogueShipIndex;
            const ship = this.gameLoop.rogueShipOrder ? this.gameLoop.rogueShipOrder[index] : null;
            if (ship && !ship.hasActedThisTurn && ship.movesRemaining > 0) {
                const moves = ship.movesRemaining;
                for (let x = 0; x < boardWidth; x++) {
                    for (let z = 0; z < boardWidth; z++) {
                        const dist = Math.abs(x - ship.headX) + Math.abs(z - ship.headZ);
                        if (dist > 0 && dist <= moves) {
                            moveRadiusSet.add(z * boardWidth + x);
                        }
                    }
                }
            }
        }

        gridState.forEach((state, index) => {
            const cell = cells[index] as HTMLElement;
            cell.className = 'mini-cell';

            if (moveRadiusSet.has(index)) {
                cell.classList.add('cell-move-radius');
            }

            const x = index % boardWidth;
            const z = Math.floor(index / boardWidth);

            switch (state) {
                case CellState.Ship:
                    if (!isRogue) {
                        if (isPlayer) cell.classList.add('cell-ship');
                        else cell.classList.add('cell-fog');
                    } else {
                        // Rogue mode: shared board has both.
                        const ship = this.gameLoop.match?.sharedBoard.getShipAt(x, z);
                        if (ship) {
                            if (!ship.isEnemy) {
                                cell.classList.add('cell-ship');
                            } else {
                                // Enemy ship: only show if revealed in 3D (not in fog)
                                if (this.entityManager && this.entityManager.isCellRevealed(x, z)) {
                                    cell.classList.add('cell-ship-enemy');
                                } else {
                                    cell.classList.add('cell-fog');
                                }
                            }
                        }
                    }
                    break;
                case CellState.Hit:
                    cell.classList.add('cell-hit');
                    // In Rogue mode, if it's a hit, we know it's a ship.
                    if (isRogue) {
                        const ship = this.gameLoop.match?.sharedBoard.getShipAt(x, z);
                        if (ship && ship.isEnemy) cell.classList.add('cell-ship-enemy');
                    }
                    break;
                case CellState.Sunk:
                    cell.classList.add('cell-sunk');
                    if (isRogue) {
                        const ship = this.gameLoop.match?.sharedBoard.getShipAt(x, z);
                        if (ship && ship.isEnemy) cell.classList.add('cell-ship-enemy');
                    }
                    break;
                case CellState.Miss:
                    cell.classList.add('cell-miss');
                    break;
                default:
                    if (isRogue) {
                        if (this.entityManager && !this.entityManager.isCellRevealed(x, z)) {
                            cell.classList.add('cell-fog');
                        }
                    } else if (!isPlayer) {
                        cell.classList.add('cell-fog');
                    }
                    break;
            }
        });
    }
}
