import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop, GameState } from '../../../application/game-loop/GameLoop';
import { Config } from '../../../infrastructure/config/Config';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';

export class Settings extends BaseUIComponent {
    private gameLoop: GameLoop;
    
    private onClickOutsideDropdowns = (e: MouseEvent) => {
        const dropdowns = this.container.querySelectorAll('.custom-dropdown');
        dropdowns.forEach(d => {
            if (!d.contains(e.target as Node)) {
                d.classList.remove('open');
            }
        });
    };

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
        document.addEventListener('click', this.onClickOutsideDropdowns);
    }

    protected onHide(): void {
        document.removeEventListener('click', this.onClickOutsideDropdowns);
        // Return to pause menu instead of resuming
        document.dispatchEvent(new CustomEvent('SHOW_PAUSE_MENU'));
    }

    protected render(): void {
        this.container.innerHTML = `
            <h2 class="voxel-title" style="font-size: 2rem;">Settings</h2>
            
            <div class="settings-row" id="difficulty-row">
                <label>Enemy AI Difficulty:</label>
                <div id="ai-difficulty-dropdown" class="custom-dropdown">
                    <div class="custom-dropdown-selected" id="ai-difficulty-selected">
                        <span id="ai-difficulty-selected-text">${this.gameLoop.aiEngine.difficulty === 'easy' ? '✔ Easy (Random)' : '✔ Normal (Hunt/Target)'}</span>
                        <span class="custom-dropdown-arrow">▾</span>
                    </div>
                    <div class="custom-dropdown-options" id="ai-difficulty-options">
                        <div class="custom-dropdown-option ${this.gameLoop.aiEngine.difficulty === 'easy' ? 'active' : ''}" data-value="easy">
                            <span class="option-check">${this.gameLoop.aiEngine.difficulty === 'easy' ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">Easy (Random)</span>
                        </div>
                        <div class="custom-dropdown-option ${this.gameLoop.aiEngine.difficulty === 'normal' ? 'active' : ''}" data-value="normal">
                            <span class="option-check">${this.gameLoop.aiEngine.difficulty === 'normal' ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">Normal (Hunt/Target)</span>
                        </div>
                    </div>
                </div>
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
                <div id="fps-cap-dropdown" class="custom-dropdown">
                    <div class="custom-dropdown-selected" id="fps-cap-selected">
                        <span id="fps-cap-selected-text">✔ ${Config.visual.fpsCap} FPS</span>
                        <span class="custom-dropdown-arrow">▾</span>
                    </div>
                    <div class="custom-dropdown-options" id="fps-cap-options">
                        <div class="custom-dropdown-option ${Config.visual.fpsCap === 30 ? 'active' : ''}" data-value="30">
                            <span class="option-check">${Config.visual.fpsCap === 30 ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">30 FPS</span>
                        </div>
                        <div class="custom-dropdown-option ${Config.visual.fpsCap === 60 ? 'active' : ''}" data-value="60">
                            <span class="option-check">${Config.visual.fpsCap === 60 ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">60 FPS</span>
                        </div>
                        <div class="custom-dropdown-option ${Config.visual.fpsCap === 120 ? 'active' : ''}" data-value="120">
                            <span class="option-check">${Config.visual.fpsCap === 120 ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">120 FPS</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="settings-row">
                <label>Auto-Battler:</label>
                <input type="checkbox" id="toggle-auto-battler" ${Config.autoBattler ? 'checked' : ''} style="transform: scale(2);">
            </div>

            <div class="settings-row">
                <label>Game Speed:</label>
                <div id="game-speed-dropdown" class="custom-dropdown">
                    <div class="custom-dropdown-selected" id="game-speed-selected">
                        <span id="game-speed-selected-text">✔ ${Config.timing.gameSpeedMultiplier === 0.5 ? '0.5x (Slow)' : Config.timing.gameSpeedMultiplier === 1.0 ? '1.0x (Normal)' : Config.timing.gameSpeedMultiplier === 2.0 ? '2.0x (Fast)' : '4.0x (Very Fast)'}</span>
                        <span class="custom-dropdown-arrow">▾</span>
                    </div>
                    <div class="custom-dropdown-options" id="game-speed-options">
                        <div class="custom-dropdown-option ${Config.timing.gameSpeedMultiplier === 0.5 ? 'active' : ''}" data-value="0.5">
                            <span class="option-check">${Config.timing.gameSpeedMultiplier === 0.5 ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">0.5x (Slow)</span>
                        </div>
                        <div class="custom-dropdown-option ${Config.timing.gameSpeedMultiplier === 1.0 ? 'active' : ''}" data-value="1.0">
                            <span class="option-check">${Config.timing.gameSpeedMultiplier === 1.0 ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">1.0x (Normal)</span>
                        </div>
                        <div class="custom-dropdown-option ${Config.timing.gameSpeedMultiplier === 2.0 ? 'active' : ''}" data-value="2.0">
                            <span class="option-check">${Config.timing.gameSpeedMultiplier === 2.0 ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">2.0x (Fast)</span>
                        </div>
                        <div class="custom-dropdown-option ${Config.timing.gameSpeedMultiplier === 4.0 ? 'active' : ''}" data-value="4.0">
                            <span class="option-check">${Config.timing.gameSpeedMultiplier === 4.0 ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">4.0x (Very Fast)</span>
                        </div>
                    </div>
                </div>
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

        this.setupDropdown('fps-cap-dropdown', (val) => {
            const fpsCap = parseInt(val, 10);
            Config.visual.fpsCap = fpsCap;
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('SET_FPS_CAP', { detail: { fpsCap } }));
        });

        document.addEventListener('SET_FPS_CAP', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.fpsCap) {
                this.updateDropdownVisuals('fps-cap-dropdown', customEvent.detail.fpsCap.toString());
            }
        });

        this.setupDropdown('game-speed-dropdown', (speed) => {
            Config.timing.gameSpeedMultiplier = parseFloat(speed);
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed } }));
        });

        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.speed) {
                this.updateDropdownVisuals('game-speed-dropdown', customEvent.detail.speed.toString());
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

        const isGameStarted = this.gameLoop.currentState !== GameState.MAIN_MENU &&
            this.gameLoop.currentState !== GameState.SETUP_BOARD;

        if (isGameStarted) {
            const aiDropdown = this.container.querySelector('#ai-difficulty-dropdown') as HTMLElement;
            if (aiDropdown) {
                aiDropdown.classList.add('disabled');
                aiDropdown.style.pointerEvents = 'none';
            }
            const row = this.container.querySelector('#difficulty-row') as HTMLElement;
            if (row) row.style.opacity = '0.5';
        }

        this.setupDropdown('ai-difficulty-dropdown', (difficulty) => {
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
                this.updateDropdownVisuals('ai-difficulty-dropdown', ce.detail.difficulty);
            }
        });

    }

    private setupDropdown(dropdownId: string, onChange: (val: string) => void) {
        const dropdownEl = this.container.querySelector(`#${dropdownId}`) as HTMLElement;
        if (!dropdownEl) return;
        const selectedEl = dropdownEl.querySelector('.custom-dropdown-selected') as HTMLElement;
        const allOptions = dropdownEl.querySelectorAll('.custom-dropdown-option') as NodeListOf<HTMLElement>;

        selectedEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdownEl.classList.contains('disabled')) return;
            // Close others
            this.container.querySelectorAll('.custom-dropdown').forEach(d => {
                if (d !== dropdownEl) d.classList.remove('open');
            });
            dropdownEl.classList.toggle('open');
        });

        allOptions.forEach((opt) => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                if (opt.classList.contains('disabled')) return;
                
                const value = opt.dataset.value as string;
                this.updateDropdownVisuals(dropdownId, value);
                
                dropdownEl.classList.remove('open');
                onChange(value);
            });
        });
    }

    private updateDropdownVisuals(dropdownId: string, value: string) {
        const dropdownEl = this.container.querySelector(`#${dropdownId}`) as HTMLElement;
        if (!dropdownEl) return;
        
        const selectedTextEl = dropdownEl.querySelector('.custom-dropdown-selected span:first-child') as HTMLElement;
        const allOptions = dropdownEl.querySelectorAll('.custom-dropdown-option') as NodeListOf<HTMLElement>;
        
        allOptions.forEach(o => {
            if (o.dataset.value === value) {
                o.classList.add('active');
                const check = o.querySelector('.option-check');
                if (check) check.innerHTML = '✔';
                if (selectedTextEl) {
                    const text = o.querySelector('.option-text')?.textContent || '';
                    selectedTextEl.textContent = `✔ ${text}`;
                }
            } else {
                o.classList.remove('active');
                const check = o.querySelector('.option-check');
                if (check) check.innerHTML = '&nbsp;';
            }
        });
    }
}
