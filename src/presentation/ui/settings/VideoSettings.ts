import { Config } from '../../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

export class VideoSettings {
    private container: HTMLElement;
    private setupDropdown: (id: string, cb: (val: string) => void) => void;
    private updateDropdownVisuals: (id: string, val: string) => void;

    constructor(
        container: HTMLElement, 
        setupDropdown: (id: string, cb: (val: string) => void) => void,
        updateDropdownVisuals: (id: string, val: string) => void
    ) {
        this.container = container;
        this.setupDropdown = setupDropdown;
        this.updateDropdownVisuals = updateDropdownVisuals;
    }

    public render(): string {
        return `
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
                <label>Color Theme:</label>
                <div id="theme-dropdown" class="custom-dropdown">
                    <div class="custom-dropdown-selected" id="theme-selected">
                        <span id="theme-selected-text">✔ ${Config.visual.colorScheme === 'default' ? 'Default (Emerald/Orange)' : Config.visual.colorScheme === 'grayscale' ? 'Grayscale (High Contrast)' : 'Custom'}</span>
                        <span class="custom-dropdown-arrow">▾</span>
                    </div>
                    <div class="custom-dropdown-options" id="theme-options">
                        <div class="custom-dropdown-option ${Config.visual.colorScheme === 'default' ? 'active' : ''}" data-value="default">
                            <span class="option-check">${Config.visual.colorScheme === 'default' ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">Default (Emerald/Orange)</span>
                        </div>
                        <div class="custom-dropdown-option ${Config.visual.colorScheme === 'grayscale' ? 'active' : ''}" data-value="grayscale">
                            <span class="option-check">${Config.visual.colorScheme === 'grayscale' ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">Grayscale (High Contrast)</span>
                        </div>
                        <div class="custom-dropdown-option ${Config.visual.colorScheme === 'custom' ? 'active' : ''}" data-value="custom">
                            <span class="option-check">${Config.visual.colorScheme === 'custom' ? '✔' : '&nbsp;'}</span>
                            <span class="option-text">Custom</span>
                        </div>
                    </div>
                </div>
            </div>

            <div id="custom-colors-container" style="display: ${Config.visual.colorScheme === 'custom' ? 'block' : 'none'}; margin-left: 20px; border-left: 2px solid var(--panel-border); padding-left: 10px; margin-bottom: 10px;">
                <div class="settings-row" style="margin-bottom: 5px;">
                    <label style="font-size: 0.9em;">Player Fleet:</label>
                    <input type="color" id="color-player-ship" value="${Config.visual.customColors.playerShip}" style="background: transparent; border: 1px solid var(--panel-border); padding: 0;">
                </div>
                <div class="settings-row" style="margin-bottom: 5px;">
                    <label style="font-size: 0.9em;">Enemy Fleet:</label>
                    <input type="color" id="color-enemy-ship" value="${Config.visual.customColors.enemyShip}" style="background: transparent; border: 1px solid var(--panel-border); padding: 0;">
                </div>
                <!-- ... other colors ... -->
                <div class="settings-row" style="margin-bottom: 5px;">
                    <label style="font-size: 0.9em;">Water Primary:</label>
                    <input type="color" id="color-water-primary" value="${Config.visual.customColors.waterPrimary}" style="background: transparent; border: 1px solid var(--panel-border); padding: 0;">
                </div>
                <div class="settings-row" style="margin-bottom: 5px;">
                    <label style="font-size: 0.9em;">Water Sec.:</label>
                    <input type="color" id="color-water-secondary" value="${Config.visual.customColors.waterSecondary}" style="background: transparent; border: 1px solid var(--panel-border); padding: 0;">
                </div>
                <div class="settings-row" style="margin-bottom: 5px;">
                    <label style="font-size: 0.9em;">Board Lines:</label>
                    <input type="color" id="color-board-lines" value="${Config.visual.customColors.boardLines}" style="background: transparent; border: 1px solid var(--panel-border); padding: 0;">
                </div>
            </div>
        `;
    }

    public attachListeners(): void {
        const toggleHud = this.container.querySelector('#toggle-hud') as HTMLInputElement;
        if (toggleHud) {
            toggleHud.addEventListener('change', (e) => {
                const isChecked = (e.target as HTMLInputElement).checked;
                eventBus.emit(GameEventType.TOGGLE_HUD, { show: isChecked });
            });
        }

        const toggleGeekStats = this.container.querySelector('#toggle-geek-stats') as HTMLInputElement;
        if (toggleGeekStats) {
            toggleGeekStats.addEventListener('change', (e) => {
                const isChecked = (e.target as HTMLInputElement).checked;
                Config.visual.showGeekStats = isChecked;
                Config.saveConfig();
                eventBus.emit(GameEventType.TOGGLE_GEEK_STATS, { show: isChecked });
            });
        }

        this.setupDropdown('fps-cap-dropdown', (val) => {
            const fpsCap = parseInt(val, 10);
            Config.visual.fpsCap = fpsCap;
            Config.saveConfig();
            eventBus.emit(GameEventType.SET_FPS_CAP, { fpsCap });
        });

        const customContainer = this.container.querySelector('#custom-colors-container') as HTMLElement;
        this.setupDropdown('theme-dropdown', (val) => {
            const scheme = val as 'default' | 'grayscale' | 'custom';
            Config.visual.colorScheme = scheme;
            Config.saveConfig();
            if (customContainer) customContainer.style.display = scheme === 'custom' ? 'block' : 'none';
            eventBus.emit(GameEventType.THEME_CHANGED, undefined as any);
        });

        const setupColorPicker = (id: string, key: keyof typeof Config.visual.customColors) => {
            const picker = this.container.querySelector(`#${id}`) as HTMLInputElement;
            if (picker) {
                picker.addEventListener('input', (e) => {
                    Config.visual.customColors[key] = (e.target as HTMLInputElement).value;
                    if (Config.visual.colorScheme !== 'custom') {
                        Config.visual.colorScheme = 'custom';
                        this.updateDropdownVisuals('theme-dropdown', 'custom');
                        if (customContainer) customContainer.style.display = 'block';
                    }
                    Config.saveConfig();
                    eventBus.emit(GameEventType.THEME_CHANGED, undefined as any);
                });
            }
        };

        setupColorPicker('color-player-ship', 'playerShip');
        setupColorPicker('color-enemy-ship', 'enemyShip');
        setupColorPicker('color-water-primary', 'waterPrimary');
        setupColorPicker('color-water-secondary', 'waterSecondary');
        setupColorPicker('color-board-lines', 'boardLines');

        eventBus.on(GameEventType.SET_FPS_CAP, (payload) => {
            if (payload && payload.fpsCap) {
                this.updateDropdownVisuals('fps-cap-dropdown', payload.fpsCap.toString());
            }
        });
    }
}
