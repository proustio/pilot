import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';
import { CellState } from '../../../domain/board/Board';
import { Config } from '../../../infrastructure/config/Config';

export class UnifiedBoardUI extends BaseUIComponent {
    private gameLoop: GameLoop;
    private playerGridContainer!: HTMLElement;
    private enemyGridContainer!: HTMLElement;

    constructor(gameLoop: GameLoop) {
        super('unified-board');
        this.gameLoop = gameLoop;

        this.gameLoop.onShipPlaced(() => this.refresh());
        this.gameLoop.onAttackResult((_x, _z, _result, _isPlayer, _isReplay) => this.refresh());
        this.gameLoop.onStateChange(() => this.refresh());
    }

    protected render(): void {
        this.container.innerHTML = `
            <div class="unified-board-container">
                <div class="mini-board-wrapper">
                    <div class="mini-board-title">YOU</div>
                    <div id="mini-player-grid" class="mini-grid"></div>
                </div>
                <div class="mini-board-wrapper">
                    <div class="mini-board-title">ENEMY</div>
                    <div id="mini-enemy-grid" class="mini-grid"></div>
                </div>
            </div>
        `;

        this.playerGridContainer = this.container.querySelector('#mini-player-grid') as HTMLElement;
        this.enemyGridContainer = this.container.querySelector('#mini-enemy-grid') as HTMLElement;

        this.initGrids();
        this.refresh();
    }

    private initGrids(): void {
        const createGrid = (container: HTMLElement) => {
            container.innerHTML = '';
            const boardWidth = this.gameLoop.match ? this.gameLoop.match.playerBoard.width : Config.board.width;
            const cellCount = this.gameLoop.match ? (this.gameLoop.match.playerBoard.width * this.gameLoop.match.playerBoard.height) : (Config.board.width * Config.board.height);
            for (let i = 0; i < cellCount; i++) {
                const cell = document.createElement('div');
                cell.classList.add('mini-cell');
                
                const x = i % boardWidth;
                const z = Math.floor(i / boardWidth);
                
                const isPlayerGrid = container === this.playerGridContainer;

                const onHover = (_e: MouseEvent) => {
                    document.dispatchEvent(new CustomEvent('MINIMAP_CELL_HOVER', {
                        detail: { x, z, isPlayerGrid }
                    }));
                };
                
                cell.addEventListener('mouseenter', onHover);
                cell.addEventListener('mousemove', onHover);
                cell.addEventListener('mouseleave', () => {
                    document.dispatchEvent(new CustomEvent('MINIMAP_CELL_HOVER', { detail: null }));
                });

                cell.addEventListener('click', () => {
                    // Only allow clicking on the enemy grid in PLAYER_TURN, or player grid in SETUP_BOARD
                    const currentState = this.gameLoop.currentState;
                    if ((isPlayerGrid && currentState === 'SETUP_BOARD') || (!isPlayerGrid && currentState === 'PLAYER_TURN')) {
                        this.gameLoop.onGridClick(x, z);
                    }
                });

                container.appendChild(cell);
            }
        };

        createGrid(this.playerGridContainer);
        createGrid(this.enemyGridContainer);

        document.addEventListener('MOUSE_CELL_HOVER', (e: Event) => {
            const ce = e as CustomEvent;
            this.clearHighlights();
            if (ce.detail) {
                this.highlightCell(ce.detail.x, ce.detail.z, ce.detail.isPlayerSide);
            }
        });
    }

    private clearHighlights(): void {
        const pCells = this.playerGridContainer.querySelectorAll('.mini-cell');
        const eCells = this.enemyGridContainer.querySelectorAll('.mini-cell');
        pCells.forEach(c => c.classList.remove('cell-highlight'));
        eCells.forEach(c => c.classList.remove('cell-highlight'));
    }

    private highlightCell(x: number, z: number, isPlayerSide: boolean): void {
        const container = isPlayerSide ? this.playerGridContainer : this.enemyGridContainer;
        const width = this.gameLoop.match ? this.gameLoop.match.playerBoard.width : Config.board.width;
        const index = z * width + x;
        const cells = container.querySelectorAll('.mini-cell');
        if (cells[index]) {
            cells[index].classList.add('cell-highlight');
        }
    }

    public refresh(): void {
        if (!this.gameLoop.match) return;

        const playerBoard = this.gameLoop.match.playerBoard;
        const enemyBoard = this.gameLoop.match.enemyBoard;

        this.updateGrid(this.playerGridContainer, playerBoard.gridState, true);
        this.updateGrid(this.enemyGridContainer, enemyBoard.gridState, false);
    }

    private updateGrid(container: HTMLElement, gridState: Uint8Array, isPlayer: boolean): void {
        const cells = container.querySelectorAll('.mini-cell');
        gridState.forEach((state, index) => {
            const cell = cells[index] as HTMLElement;
            cell.className = 'mini-cell';

            switch (state) {
                case CellState.Ship:
                    if (isPlayer) {
                        cell.classList.add('cell-ship');
                    } else {
                        cell.classList.add('cell-fog');
                    }
                    break;
                case CellState.Hit:
                    cell.classList.add('cell-hit');
                    break;
                case CellState.Sunk:
                    cell.classList.add('cell-sunk');
                    break;
                case CellState.Miss:
                    cell.classList.add('cell-miss');
                    break;
                default:
                    if (!isPlayer) {
                        cell.classList.add('cell-fog');
                    }
                    break;
            }
        });
    }
}
