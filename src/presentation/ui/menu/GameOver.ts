import { BaseUIComponent } from '../components/BaseUIComponent';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

export class GameOver extends BaseUIComponent {
    constructor() {
        super('game-over');
        this.container.classList.add('voxel-panel');
    }

    protected render(): void {
        this.container.innerHTML = `
            <h1 id="game-over-title" class="voxel-title" style="font-size: 3rem; margin-bottom: 10px;">Game Over</h1>
            <p id="game-over-message" style="margin-bottom: 30px; font-size: 1.5rem;"></p>
            <button id="btn-gameover-restart" class="voxel-btn primary">Play Again</button>
            <button id="btn-gameover-exit" class="voxel-btn secondary">Main Menu</button>
        `;

        const restartBtn = this.container.querySelector('#btn-gameover-restart') as HTMLButtonElement;
        restartBtn.addEventListener('click', () => {
            window.location.reload();
        });

        const exitBtn = this.container.querySelector('#btn-gameover-exit') as HTMLButtonElement;
        exitBtn.addEventListener('click', () => {
            eventBus.emit(GameEventType.EXIT_GAME, undefined as any);
            window.location.reload();
        });
    }

    public updateMessage(status: string) {
        const title = this.container.querySelector('#game-over-title') as HTMLElement;
        const msg = this.container.querySelector('#game-over-message') as HTMLElement;
        
        if (status === 'player_wins') {
            title.innerText = 'VICTORY!';
            title.style.color = 'var(--color-primary)';
            msg.innerText = 'All enemy ships have been sunk.';
        } else {
            title.innerText = 'DEFEAT!';
            title.style.color = 'var(--color-danger)';
            msg.innerText = 'Your fleet was destroyed.';
        }
    }
}
