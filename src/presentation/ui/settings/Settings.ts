import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { Config } from '../../../infrastructure/config/Config';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';

export class Settings extends BaseUIComponent {
    private gameLoop: GameLoop;

    constructor(gameLoop: GameLoop) {
        super('settings-modal');
        this.gameLoop = gameLoop;
        this.container.classList.add('voxel-panel');
        this.container.style.zIndex = '100';
    }

    protected onShow(): void {
        document.dispatchEvent(new CustomEvent('PAUSE_GAME'));
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
        this.render();
    }

    protected onHide(): void {
        // Return to pause menu instead of resuming
        document.dispatchEvent(new CustomEvent('SHOW_PAUSE_MENU'));
    }

    protected render(): void {
        this.container.innerHTML = `
            <h2 class="voxel-title" style="font-size: 2rem;">Settings</h2>
            
            <div class="settings-row" id="difficulty-row">
                <label>Enemy AI Difficulty:</label>
                <select id="ai-difficulty" class="voxel-select" style="width: auto;">
                    <option value="easy" ${this.gameLoop.aiEngine.difficulty === 'easy' ? 'selected' : ''}>Easy (Random)</option>
                    <option value="normal" ${this.gameLoop.aiEngine.difficulty === 'normal' ? 'selected' : ''}>Normal (Hunt/Target)</option>
                </select>
            </div>

            <div class="settings-row">
                <label>Master Volume:</label>
                <input type="range" id="sound-volume" min="0" max="1" step="0.05" value="${Config.audio.masterVolume}" class="voxel-slider" style="flex-grow: 1; margin-left: 20px;">
                <span id="volume-value" style="width: 40px; text-align: right;">${Math.round(Config.audio.masterVolume * 100)}%</span>
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
                <label>FPS Cap:</label>
                <select id="fps-cap" class="voxel-select" style="width: auto;">
                    <option value="30" ${Config.visual.fpsCap === 30 ? 'selected' : ''}>30 FPS</option>
                    <option value="60" ${Config.visual.fpsCap === 60 ? 'selected' : ''}>60 FPS</option>
                    <option value="120" ${Config.visual.fpsCap === 120 ? 'selected' : ''}>120 FPS</option>
                </select>
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
            
            <button id="btn-close-settings" class="voxel-btn primary" style="margin-top: 10px;">Back</button>
        `;

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
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('TOGGLE_GEEK_STATS', { detail: { show: isChecked } }));
        });

        const fpsCapSelect = this.container.querySelector('#fps-cap') as HTMLSelectElement;
        fpsCapSelect.addEventListener('change', (e) => {
            const fpsCap = parseInt((e.target as HTMLSelectElement).value, 10);
            Config.visual.fpsCap = fpsCap;
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('SET_FPS_CAP', { detail: { fpsCap } }));
        });

        document.addEventListener('SET_FPS_CAP', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.fpsCap) {
                fpsCapSelect.value = customEvent.detail.fpsCap.toString();
            }
        });

        const gameSpeedSelect = this.container.querySelector('#game-speed') as HTMLSelectElement;
        gameSpeedSelect.addEventListener('change', (e) => {
            const speed = (e.target as HTMLSelectElement).value;
            Config.timing.gameSpeedMultiplier = parseFloat(speed);
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed } }));
        });

        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.speed) {
                gameSpeedSelect.value = customEvent.detail.speed.toString();
            }
        });

        const volumeSlider = this.container.querySelector('#sound-volume') as HTMLInputElement;
        const volumeValue = this.container.querySelector('#volume-value') as HTMLElement;
        volumeSlider.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            volumeValue.textContent = `${Math.round(val * 100)}%`;
            Config.audio.masterVolume = val;
            Config.saveConfig();
            AudioEngine.getInstance().setVolume(val);
        });

        const aiSelect = this.container.querySelector('#ai-difficulty') as HTMLSelectElement;

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
            Config.aiDifficulty = difficulty;
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('SET_AI_DIFFICULTY', { detail: { difficulty } }));
        });

        const autoBattlerSettingsToggle = this.container.querySelector('#toggle-auto-battler') as HTMLInputElement;
        autoBattlerSettingsToggle.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            Config.autoBattler = isChecked;
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('TOGGLE_AUTO_BATTLER', { detail: { enabled: isChecked } }));
        });

        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.enabled !== undefined) {
                autoBattlerSettingsToggle.checked = customEvent.detail.enabled;
            }
        });

        document.addEventListener('SET_AI_DIFFICULTY', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.difficulty) {
                aiSelect.value = ce.detail.difficulty;
            }
        });

    }
}
