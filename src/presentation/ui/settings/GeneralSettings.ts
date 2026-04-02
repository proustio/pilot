import { Config } from '../../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { GameState } from '../../../application/game-loop/GameLoop';
import { TemplateEngine } from '../templates/TemplateEngine';
import generalSettingsTemplate from '../templates/GeneralSettings.html?raw';

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

        return TemplateEngine.render(generalSettingsTemplate, {
            isGameStarted,
            gameLoop: this.gameLoop,
            Config: Config
        });
    }

    public attachListeners(): void {
        this.setupDropdown('ai-difficulty-dropdown', (difficulty) => {
            Config.aiDifficulty = difficulty;
            Config.saveConfig();
            eventBus.emit(GameEventType.SET_AI_DIFFICULTY, { difficulty: difficulty as any });
        });

        const autoBattlerToggle = this.container.querySelector('#toggle-auto-battler') as HTMLInputElement;
        if (autoBattlerToggle) {
            autoBattlerToggle.addEventListener('change', (e) => {
                const isChecked = (e.target as HTMLInputElement).checked;
                Config.autoBattler = isChecked;
                Config.saveConfig();
                eventBus.emit(GameEventType.TOGGLE_AUTO_BATTLER, { enabled: isChecked });
            });
        }

        this.setupDropdown('game-speed-dropdown', (speed) => {
            const s = parseFloat(speed);
            Config.timing.gameSpeedMultiplier = s;
            Config.saveConfig();
            eventBus.emit(GameEventType.SET_GAME_SPEED, { speed: s });
        });

        // Listen for external changes to sync UI
        eventBus.on(GameEventType.SET_AI_DIFFICULTY, (payload) => {
            this.updateDropdownVisuals('ai-difficulty-dropdown', payload.difficulty);
        });

        eventBus.on(GameEventType.SET_GAME_SPEED, (payload) => {
            this.updateDropdownVisuals('game-speed-dropdown', payload.speed.toString());
        });

        eventBus.on(GameEventType.TOGGLE_AUTO_BATTLER, (payload) => {
            if (autoBattlerToggle) autoBattlerToggle.checked = payload.enabled;
        });
    }
}
