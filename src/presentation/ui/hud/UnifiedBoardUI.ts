import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';
import { CellState } from '../../../domain/board/Board';

export class UnifiedBoardUI extends BaseUIComponent {
    private gameLoop: GameLoop;
    private playerGridContainer!: HTMLElement;
    private enemyGridContainer!: HTMLElement;

    constructor(gameLoop: GameLoop) {
        super('unified-board');
        this.gameLoop = gameLoop;

        // Listen for board updates
        this.gameLoop.onShipPlaced(() => this.refresh());
        this.gameLoop.onAttackResult(() => this.refresh());
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
            for (let i = 0; i < 100; i++) {
                const cell = document.createElement('div');
                cell.classList.add('mini-cell');
                container.appendChild(cell);
            }
        };

        createGrid(this.playerGridContainer);
        createGrid(this.enemyGridContainer);
    }

    public refresh(): void {
        if (!this.gameLoop.match) return;

        const playerBoard = this.gameLoop.match.playerBoard;
        const enemyBoard = this.gameLoop.match.enemyBoard;

        this.updateGrid(this.playerGridContainer, playerBoard.gridState, true);
        this.updateGrid(this.enemyGridContainer, enemyBoard.gridState, false);
    }

    private updateGrid(container: HTMLElement, gridState: CellState[], isPlayer: boolean): void {
        const cells = container.querySelectorAll('.mini-cell');
        gridState.forEach((state, index) => {
            const cell = cells[index] as HTMLElement;
            cell.className = 'mini-cell'; // Reset classes

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
                    // Empty
                    if (!isPlayer) {
                        cell.classList.add('cell-fog');
                    }
                    break;
            }
        });
    }
}
