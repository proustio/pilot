import { Config } from '../../../infrastructure/config/Config';
import { GameState } from '../../../application/game-loop/GameLoop';

export class GeneralSettings {
    private container: HTMLElement;
    private gameLoop: any;
    private setupDropdown: (id: string, cb: (val: string) => void) => void;
    private updateDropdownVisuals: (id: string, val: string) => void;

    constructor(
        container: HTMLElement,
        gameLoop: any,
        setupDropdown: (id: string, cb: (val: string) => void) => void,
        updateDropdownVisuals: (id: string, val: string) => void
    ) {
        this.container = container;
        this.gameLoop = gameLoop;
        this.setupDropdown = setupDropdown;
        this.updateDropdownVisuals = updateDropdownVisuals;
    }

    public render(): string {
        const isGameStarted = this.gameLoop.currentState !== GameState.MAIN_MENU &&
                             this.gameLoop.currentState !== GameState.SETUP_BOARD;

        return `
            <div class="settings-row" id="difficulty-row" style="${isGameStarted ? 'opacity: 0.5;' : ''}">
                <label>Enemy AI Difficulty:</label>
                <div id="ai-difficulty-dropdown" class="custom-dropdown ${isGameStarted ? 'disabled' : ''}" style="${isGameStarted ? 'pointer-events: none;' : ''}">
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
        `;
    }

    public attachListeners(): void {
        this.setupDropdown('ai-difficulty-dropdown', (difficulty) => {
            Config.aiDifficulty = difficulty;
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('SET_AI_DIFFICULTY', { detail: { difficulty } }));
        });

        const autoBattlerSettingsToggle = this.container.querySelector('#toggle-auto-battler') as HTMLInputElement;
        if (autoBattlerSettingsToggle) {
            autoBattlerSettingsToggle.addEventListener('change', (e) => {
                const isChecked = (e.target as HTMLInputElement).checked;
                Config.autoBattler = isChecked;
                Config.saveConfig();
                document.dispatchEvent(new CustomEvent('TOGGLE_AUTO_BATTLER', { detail: { enabled: isChecked } }));
            });
        }

        this.setupDropdown('game-speed-dropdown', (speed) => {
            Config.timing.gameSpeedMultiplier = parseFloat(speed);
            Config.saveConfig();
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed } }));
        });

        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.speed) {
                this.updateDropdownVisuals('game-speed-dropdown', ce.detail.speed.toString());
            }
        });

        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.enabled !== undefined && autoBattlerSettingsToggle) {
                autoBattlerSettingsToggle.checked = ce.detail.enabled;
            }
        });

        document.addEventListener('SET_AI_DIFFICULTY', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.difficulty) {
                this.updateDropdownVisuals('ai-difficulty-dropdown', ce.detail.difficulty);
            }
        });
    }
}
