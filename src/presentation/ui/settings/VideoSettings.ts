import { Config } from '../../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { TemplateEngine } from '../templates/TemplateEngine';
import videoSettingsTemplate from '../templates/VideoSettings.html?raw';

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
        return TemplateEngine.render(videoSettingsTemplate, {
            Config: Config
        });
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
