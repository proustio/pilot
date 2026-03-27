import { BaseUIComponent } from '../components/BaseUIComponent';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { TemplateEngine } from '../templates/TemplateEngine';
import gameOverTemplate from '../templates/GameOver.html?raw';

export class GameOver extends BaseUIComponent {
    constructor() {
        super('game-over');
        this.container.classList.add('voxel-panel');
    }

    protected render(): void {
        this.container.innerHTML = TemplateEngine.render(gameOverTemplate, {});

        const restartBtn = this.container.querySelector('#btn-gameover-restart') as HTMLButtonElement;
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                window.location.reload();
            });
        }

        const exitBtn = this.container.querySelector('#btn-gameover-exit') as HTMLButtonElement;
        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                eventBus.emit(GameEventType.EXIT_GAME, undefined as any);
                window.location.reload();
            });
        }
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
