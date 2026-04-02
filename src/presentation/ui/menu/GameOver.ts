import { BaseUIComponent } from '../components/BaseUIComponent';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { TemplateEngine } from '../templates/TemplateEngine';
import gameOverTemplate from '../templates/GameOver.html?raw';

export class GameOver extends BaseUIComponent {
    constructor() {
        super('game-over');
        this.container.classList.add('absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'bg-[rgba(20,20,20,0.55)]', 'backdrop-blur-[8px]', 'border-4', 'border-[#333]', 'rounded', 'shadow-voxel-panel', 'text-[#eee]', 'p-8', 'pointer-events-auto', 'text-shadow-voxel', 'z-[200]', 'w-[500px]', 'max-w-[90vw]', 'flex', 'flex-col', 'items-center', 'justify-center');
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
            title.classList.add('text-theme-primary');
            title.classList.remove('text-theme-danger');
            msg.innerText = 'All enemy ships have been sunk.';
        } else {
            title.innerText = 'DEFEAT!';
            title.classList.add('text-theme-danger');
            title.classList.remove('text-theme-primary');
            msg.innerText = 'Your fleet was destroyed.';
        }
    }
}
