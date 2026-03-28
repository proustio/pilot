import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { Storage } from '../../../infrastructure/storage/Storage';

export class PauseMenu extends BaseUIComponent {
    private gameLoop: GameLoop;

    constructor(gameLoop: GameLoop) {
        super('pause-menu');
        this.gameLoop = gameLoop;
        this.container.classList.add('absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'bg-[rgba(20,20,20,0.55)]', 'backdrop-blur-[8px]', 'border-4', 'border-[#333]', 'rounded', 'shadow-voxel-panel', 'text-[#eee]', 'p-8', 'pointer-events-auto', 'text-shadow-voxel', 'z-[100]', 'flex', 'flex-col', 'gap-4', 'min-w-[300px]');
    }

    protected render(): void {
        this.container.innerHTML = `
            <h2 class="font-mono font-bold uppercase tracking-[2px] text-theme-text text-shadow-voxel-title text-center mb-6" style="font-size: 2rem;">Pause</h2>
            
            <button id="btn-pause-resume" class="bg-btn-primary-bg text-white border border-theme-secondary rounded shadow-voxel-btn-primary px-6 py-3 my-1 font-mono text-[1.2rem] font-bold uppercase cursor-pointer transition-all duration-100 w-full text-shadow-[0_0_5px_var(--color-secondary)] tracking-wider hover:bg-btn-primary-hover hover:shadow-[inset_0_0_15px_rgba(34,139,34,0.8),0_0_10px_rgba(34,139,34,0.5)] active:shadow-voxel-btn-active active:translate-y-[2px]">Resume</button>
            <button id="btn-pause-save" class="bg-btn-bg text-btn-text border border-btn-border rounded shadow-voxel-btn px-6 py-3 my-1 font-mono text-[1.2rem] font-bold uppercase cursor-pointer transition-all duration-100 w-full text-shadow-voxel-btn tracking-wider hover:bg-btn-hover hover:shadow-voxel-btn-hover hover:text-shadow-[0_0_8px_rgba(255,215,0,1)] active:shadow-voxel-btn-active active:translate-y-[2px]">Save</button>
            <button id="btn-pause-load" class="bg-btn-bg text-btn-text border border-btn-border rounded shadow-voxel-btn px-6 py-3 my-1 font-mono text-[1.2rem] font-bold uppercase cursor-pointer transition-all duration-100 w-full text-shadow-voxel-btn tracking-wider hover:bg-btn-hover hover:shadow-voxel-btn-hover hover:text-shadow-[0_0_8px_rgba(255,215,0,1)] active:shadow-voxel-btn-active active:translate-y-[2px]">Load</button>
            <button id="btn-pause-settings" class="bg-btn-bg text-btn-text border border-btn-border rounded shadow-voxel-btn px-6 py-3 my-1 font-mono text-[1.2rem] font-bold uppercase cursor-pointer transition-all duration-100 w-full text-shadow-voxel-btn tracking-wider hover:bg-btn-hover hover:shadow-voxel-btn-hover hover:text-shadow-[0_0_8px_rgba(255,215,0,1)] active:shadow-voxel-btn-active active:translate-y-[2px]">Settings</button>
            <button id="btn-pause-exit" class="bg-btn-danger-bg text-theme-danger border border-theme-danger rounded shadow-voxel-btn-danger px-6 py-3 my-1 font-mono text-[1.2rem] font-bold uppercase cursor-pointer transition-all duration-100 w-full text-shadow-voxel-btn tracking-wider hover:bg-btn-danger-hover hover:text-white active:shadow-voxel-btn-active active:translate-y-[2px]">Quit</button>

            <div id="exit-confirm-overlay" class="confirm-overlay hidden fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center">
                <div class="confirm-dialog bg-[rgba(20,20,20,0.55)] backdrop-blur-[8px] border-4 border-[#333] rounded shadow-voxel-panel text-[#eee] p-8 pointer-events-auto relative text-shadow-voxel max-w-[400px]">
                    <p class="mb-6 text-center">You have unsaved progress.<br>Are you sure you want to quit?</p>
                    <div class="flex gap-4 justify-center">
                        <button id="exit-confirm-yes" class="bg-btn-primary-bg text-white border border-theme-secondary rounded shadow-voxel-btn-primary px-6 py-2.5 font-mono text-[1.2rem] font-bold uppercase cursor-pointer transition-all duration-100 w-auto text-shadow-[0_0_5px_var(--color-secondary)] tracking-wider hover:bg-btn-primary-hover hover:shadow-[inset_0_0_15px_rgba(34,139,34,0.8),0_0_10px_rgba(34,139,34,0.5)] active:shadow-voxel-btn-active active:translate-y-[2px]">Yes</button>
                        <button id="exit-confirm-no" class="bg-btn-bg text-btn-text border border-btn-border rounded shadow-voxel-btn px-6 py-2.5 font-mono text-[1.2rem] font-bold uppercase cursor-pointer transition-all duration-100 w-auto text-shadow-voxel-btn tracking-wider hover:bg-btn-hover hover:shadow-voxel-btn-hover hover:text-shadow-[0_0_8px_rgba(255,215,0,1)] active:shadow-voxel-btn-active active:translate-y-[2px]">No</button>
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
