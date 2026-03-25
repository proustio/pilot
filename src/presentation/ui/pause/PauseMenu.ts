import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { Storage } from '../../../infrastructure/storage/Storage';

export class PauseMenu extends BaseUIComponent {
    private gameLoop: GameLoop;

    constructor(gameLoop: GameLoop) {
        super('pause-menu');
        this.gameLoop = gameLoop;
        this.container.classList.add('voxel-panel');
        this.container.style.zIndex = '100';
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
                        <button id="exit-confirm-yes" class="voxel-btn primary" style="width:auto; padding:10px 24px;">Yes</button>
                        <button id="exit-confirm-no" class="voxel-btn" style="width:auto; padding:10px 24px;">No</button>
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
            eventBus.emit(GameEventType.SHOW_SAVE_DIALOG, undefined as any);
        });

        // Load
        const loadBtn = this.container.querySelector('#btn-pause-load') as HTMLButtonElement;
        loadBtn.addEventListener('click', () => {
            this.hide();
            eventBus.emit(GameEventType.SHOW_LOAD_DIALOG, undefined as any);
        });

        // Settings
        const settingsBtn = this.container.querySelector('#btn-pause-settings') as HTMLButtonElement;
        settingsBtn.addEventListener('click', () => {
            // Keep PauseMenu visible underneath settings
            eventBus.emit(GameEventType.SHOW_SETTINGS, undefined as any);
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
                    eventBus.emit(GameEventType.EXIT_GAME, undefined as any);
                    Storage.clearSession();
                    window.location.reload();
                }, { once: true });

                noBtn.addEventListener('click', () => {
                    overlay.style.display = 'none';
                }, { once: true });
            } else {
                eventBus.emit(GameEventType.EXIT_GAME, undefined as any);
                Storage.clearSession();
                window.location.reload();
            }
        });
    }
}
