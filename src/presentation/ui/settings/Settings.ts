import { BaseUIComponent } from '../components/BaseUIComponent';
import { Config } from '../../../infrastructure/config/Config';

export class Settings extends BaseUIComponent {
    constructor() {
        super('settings-modal');
        this.container.classList.add('voxel-panel');
        // Let's place it high z-index
        this.container.style.zIndex = '100';
    }

    protected onShow(): void {
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: false } }));
    }

    protected onHide(): void {
        document.dispatchEvent(new CustomEvent('SET_INTERACTION_ENABLED', { detail: { enabled: true } }));
    }

    protected render(): void {
        this.container.innerHTML = `
            <h2 class="voxel-title" style="font-size: 2rem;">Settings</h2>
            
            <div class="settings-row">
                <label>Enemy AI Difficulty:</label>
                <select id="ai-difficulty" class="voxel-select" style="width: auto;">
                    <option value="easy">Easy (Random)</option>
                    <option value="normal">Normal (Hunt/Target)</option>
                    <option value="hard">Hard (Probabilistic)</option>
                </select>
            </div>

            <div class="settings-row">
                <label>Show HUD:</label>
                <input type="checkbox" id="toggle-hud" checked style="transform: scale(2);">
            </div>

            <div class="settings-row">
                <label>Show FPS Counter:</label>
                <input type="checkbox" id="toggle-fps" ${Config.visual.showFpsCounter ? 'checked' : ''} style="transform: scale(2);">
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
            
            <button id="btn-close-settings" class="voxel-btn primary" style="margin-top: 20px;">Close</button>
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
        
        const toggleFps = this.container.querySelector('#toggle-fps') as HTMLInputElement;
        toggleFps.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            Config.visual.showFpsCounter = isChecked;
            document.dispatchEvent(new CustomEvent('TOGGLE_FPS_COUNTER', { detail: { show: isChecked } }));
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
        aiSelect.addEventListener('change', (e) => {
            const difficulty = (e.target as HTMLSelectElement).value;
            // dispatch custom event to AI system later
            console.log("AI Difficulty set to: ", difficulty);
            document.dispatchEvent(new CustomEvent('SET_AI_DIFFICULTY', { detail: { difficulty } }));
        });

        const autoBattlerSettingsToggle = this.container.querySelector('#toggle-auto-battler') as HTMLInputElement;
        autoBattlerSettingsToggle.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            Config.autoBattler = isChecked;
            document.dispatchEvent(new CustomEvent('TOGGLE_AUTO_BATTLER', { detail: { enabled: isChecked } }));
        });
    }
}
