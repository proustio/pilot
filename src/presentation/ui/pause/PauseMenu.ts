import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';

export class PauseMenu extends BaseUIComponent {
    private gameLoop: GameLoop;

    constructor(gameLoop: GameLoop) {
        super('pause-menu');
        this.gameLoop = gameLoop;
        this.container.classList.add('voxel-panel');
        this.container.style.zIndex = '100';
    }

    protected onShow(): void {
        document.dispatchEvent(new CustomEvent('PAUSE_GAME'));
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
    }

    protected onHide(): void {
        document.dispatchEvent(new CustomEvent('RESUME_GAME'));
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
    }

    protected render(): void {
        this.container.innerHTML = `
            <h2 class="voxel-title" style="font-size: 2rem;">Pause</h2>
            
            <button id="btn-pause-resume" class="voxel-btn primary">Resume</button>
            <button id="btn-pause-save" class="voxel-btn">Save</button>
            <button id="btn-pause-load" class="voxel-btn">Load</button>
            <button id="btn-pause-settings" class="voxel-btn">Settings</button>
            <button id="btn-pause-exit" class="voxel-btn danger">Quit</button>

            <div id="exit-confirm-overlay" class="confirm-overlay" style="display:none;">
                <div class="confirm-dialog voxel-panel">
                    <p>You have unsaved progress.<br>Are you sure you want to quit?</p>
                    <div style="display:flex; gap:10px; justify-content:center;">
                        <button id="exit-confirm-yes" class="voxel-btn primary" style="width:auto; padding:10px 24px;">Yes, Exit</button>
                        <button id="exit-confirm-no" class="voxel-btn" style="width:auto; padding:10px 24px;">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        // Resume
        const resumeBtn = this.container.querySelector('#btn-pause-resume') as HTMLButtonElement;
        resumeBtn.addEventListener('click', () => this.hide());

        // Save
        const saveBtn = this.container.querySelector('#btn-pause-save') as HTMLButtonElement;
        saveBtn.addEventListener('click', () => {
            this.hide();
            document.dispatchEvent(new CustomEvent('SHOW_SAVE_DIALOG'));
        });

        // Load
        const loadBtn = this.container.querySelector('#btn-pause-load') as HTMLButtonElement;
        loadBtn.addEventListener('click', () => {
            this.hide();
            document.dispatchEvent(new CustomEvent('SHOW_LOAD_DIALOG'));
        });

        // Settings
        const settingsBtn = this.container.querySelector('#btn-pause-settings') as HTMLButtonElement;
        settingsBtn.addEventListener('click', () => {
            this.hide();
            document.dispatchEvent(new CustomEvent('SHOW_SETTINGS'));
        });

        // Exit to Main Menu
        const exitBtn = this.container.querySelector('#btn-pause-exit') as HTMLButtonElement;
        exitBtn.addEventListener('click', () => {
            if (this.gameLoop.hasUnsavedProgress()) {
                const overlay = this.container.querySelector('#exit-confirm-overlay') as HTMLElement;
                overlay.style.display = 'flex';

                const yesBtn = this.container.querySelector('#exit-confirm-yes') as HTMLButtonElement;
                const noBtn = this.container.querySelector('#exit-confirm-no') as HTMLButtonElement;

                yesBtn.addEventListener('click', () => {
                    window.location.reload();
                }, { once: true });

                noBtn.addEventListener('click', () => {
                    overlay.style.display = 'none';
                }, { once: true });
            } else {
                window.location.reload();
            }
        });
    }
}
