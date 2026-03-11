import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { Config } from '../../../infrastructure/config/Config';

export class Settings extends BaseUIComponent {
    private gameLoop: GameLoop;

    constructor(gameLoop: GameLoop) {
        super('settings-modal');
        this.gameLoop = gameLoop;
        this.container.classList.add('voxel-panel');
        // Let's place it high z-index
        this.container.style.zIndex = '100';
    }

    protected onShow(): void {
        document.dispatchEvent(new CustomEvent('PAUSE_GAME'));
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
        this.render(); // Re-render to update difficulty eligibility
    }

    protected onHide(): void {
        document.dispatchEvent(new CustomEvent('RESUME_GAME'));
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
    }

    protected render(): void {
        const isInGame = this.gameLoop.currentState !== GameState.MAIN_MENU;

        this.container.innerHTML = `
            <h2 class="voxel-title" style="font-size: 2rem;">Pause</h2>
            
            <div class="settings-row" id="difficulty-row">
                <label>Enemy AI Difficulty:</label>
                <select id="ai-difficulty" class="voxel-select" style="width: auto;">
                    <option value="easy" ${this.gameLoop.aiEngine.difficulty === 'easy' ? 'selected' : ''}>Easy (Random)</option>
                    <option value="normal" ${this.gameLoop.aiEngine.difficulty === 'normal' ? 'selected' : ''}>Normal (Hunt/Target)</option>
                    <option value="hard" ${this.gameLoop.aiEngine.difficulty === 'hard' ? 'selected' : ''}>Hard (Probabilistic)</option>
                </select>
            </div>

            <div class="settings-row">
                <label>Show HUD:</label>
                <input type="checkbox" id="toggle-hud" checked style="transform: scale(2);">
            </div>

            <div class="settings-row">
                <label>Show Geek Stats:</label>
                <input type="checkbox" id="toggle-geek-stats" ${Config.visual.showGeekStats ? 'checked' : ''} style="transform: scale(2);">
            </div>

            <div class="settings-row">
                <label>Auto-Battler:</label>
                <input type="checkbox" id="toggle-auto-battler" ${Config.autoBattler ? 'checked' : ''} style="transform: scale(2);">
            </div>

            <div class="settings-row">
                <label>Game Speed:</label>
                <select id="game-speed" class="voxel-select" style="width: auto;">
                    <option value="0.5" ${Config.timing.gameSpeedMultiplier === 0.5 ? 'selected' : ''}>0.5x (Slow)</option>
                    <option value="1.0" ${Config.timing.gameSpeedMultiplier === 1.0 ? 'selected' : ''}>1.0x (Normal)</option>
                    <option value="2.0" ${Config.timing.gameSpeedMultiplier === 2.0 ? 'selected' : ''}>2.0x (Fast)</option>
                    <option value="4.0" ${Config.timing.gameSpeedMultiplier === 4.0 ? 'selected' : ''}>4.0x (Very Fast)</option>
                </select>
            </div>

            ${isInGame ? `
                <div style="margin-top: 10px; width: 100%; border-top: 2px dashed #555; padding-top: 10px; display: flex; flex-direction: column;">
                    <button id="btn-save-game" class="voxel-btn">Save Game</button>
                    <button id="btn-load-game" class="voxel-btn">Load Game</button>
                    <button id="btn-exit-menu" class="voxel-btn" style="color: var(--color-danger);">Exit to Main Menu</button>
                </div>
            ` : ''}
            
            <button id="btn-close-settings" class="voxel-btn primary" style="margin-top: 10px;">Resume</button>

            <div id="exit-confirm-overlay" class="confirm-overlay" style="display:none;">
                <div class="confirm-dialog voxel-panel">
                    <p>You have unsaved progress.<br>Are you sure you want to exit?</p>
                    <div style="display:flex; gap:10px; justify-content:center;">
                        <button id="exit-confirm-yes" class="voxel-btn primary" style="width:auto; padding:10px 24px;">Yes, Exit</button>
                        <button id="exit-confirm-no" class="voxel-btn" style="width:auto; padding:10px 24px;">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        // Bind events
        const closeBtn = this.container.querySelector('#btn-close-settings') as HTMLButtonElement;
        closeBtn.addEventListener('click', () => {
            this.hide();
        });

        const toggleHud = this.container.querySelector('#toggle-hud') as HTMLInputElement;
        toggleHud.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            document.dispatchEvent(new CustomEvent('TOGGLE_HUD', { detail: { show: isChecked } }));
        });

        const toggleGeekStats = this.container.querySelector('#toggle-geek-stats') as HTMLInputElement;
        toggleGeekStats.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            Config.visual.showGeekStats = isChecked;
            document.dispatchEvent(new CustomEvent('TOGGLE_GEEK_STATS', { detail: { show: isChecked } }));
        });

        const gameSpeedSelect = this.container.querySelector('#game-speed') as HTMLSelectElement;
        gameSpeedSelect.addEventListener('change', (e) => {
            const speed = (e.target as HTMLSelectElement).value;
            Config.timing.gameSpeedMultiplier = parseFloat(speed);
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed } }));
        });

        // Listen for internal speed changes triggered from HUD
        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.speed) {
                gameSpeedSelect.value = customEvent.detail.speed.toString();
            }
        });

        const aiSelect = this.container.querySelector('#ai-difficulty') as HTMLSelectElement;

        // Disable difficulty if game is in progress
        const isGameStarted = this.gameLoop.currentState !== GameState.MAIN_MENU &&
            this.gameLoop.currentState !== GameState.SETUP_BOARD;

        if (isGameStarted) {
            aiSelect.disabled = true;
            const row = this.container.querySelector('#difficulty-row') as HTMLElement;
            if (row) row.style.opacity = '0.5';
        }

        aiSelect.addEventListener('change', (e) => {
            const difficulty = (e.target as HTMLSelectElement).value;
            console.log("AI Difficulty set to: ", difficulty);
            document.dispatchEvent(new CustomEvent('SET_AI_DIFFICULTY', { detail: { difficulty } }));
        });

        const autoBattlerSettingsToggle = this.container.querySelector('#toggle-auto-battler') as HTMLInputElement;
        autoBattlerSettingsToggle.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            Config.autoBattler = isChecked;
            document.dispatchEvent(new CustomEvent('TOGGLE_AUTO_BATTLER', { detail: { enabled: isChecked } }));
        });

        // Sync auto-battler if changed elsewhere
        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.enabled !== undefined) {
                autoBattlerSettingsToggle.checked = customEvent.detail.enabled;
            }
        });

        // Also sync AI difficulty if changed elsewhere
        document.addEventListener('SET_AI_DIFFICULTY', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.difficulty) {
                aiSelect.value = ce.detail.difficulty;
            }
        });

        // In-game buttons
        if (isInGame) {
            const saveBtn = this.container.querySelector('#btn-save-game') as HTMLButtonElement;
            saveBtn.addEventListener('click', () => {
                this.hide();
                document.dispatchEvent(new CustomEvent('SHOW_SAVE_DIALOG'));
            });

            const loadBtn = this.container.querySelector('#btn-load-game') as HTMLButtonElement;
            loadBtn.addEventListener('click', () => {
                this.hide();
                document.dispatchEvent(new CustomEvent('SHOW_LOAD_DIALOG'));
            });

            const exitBtn = this.container.querySelector('#btn-exit-menu') as HTMLButtonElement;
            exitBtn.addEventListener('click', () => {
                if (this.gameLoop.hasUnsavedProgress()) {
                    // Show confirmation
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
}
