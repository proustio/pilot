import { BaseUIComponent } from '../components/BaseUIComponent';

export class GameOver extends BaseUIComponent {
    constructor() {
        super('game-over');
        this.container.classList.add('voxel-panel');
    }

    protected render(): void {
        this.container.innerHTML = `
            <h1 id="game-over-title" class="voxel-title" style="font-size: 3rem; margin-bottom: 10px;">Game Over</h1>
            <p id="game-over-message" style="margin-bottom: 30px; font-size: 1.5rem;"></p>
            <button id="btn-return-menu" class="voxel-btn primary">Main Menu</button>
        `;

        const returnBtn = this.container.querySelector('#btn-return-menu') as HTMLButtonElement;
        returnBtn.addEventListener('click', () => {
            // For MVP simplicity and to ensure total clean state of 3D entities, reload
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
