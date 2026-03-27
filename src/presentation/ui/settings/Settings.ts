import { BaseUIComponent } from '../components/BaseUIComponent';
import { Config } from '../../../infrastructure/config/Config';
import { GameState } from '../../../application/game-loop/GameLoop';
import { GeneralSettings } from './GeneralSettings';
import { VideoSettings } from './VideoSettings';
import { AudioSettings } from './AudioSettings';
import { KeybindingEditor } from './KeybindingEditor';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { TemplateEngine } from '../templates/TemplateEngine';
import settingsTemplate from '../templates/Settings.html?raw';

export class Settings extends BaseUIComponent {
    private gameLoop: any;

    private generalSettings: GeneralSettings;
    private videoSettings: VideoSettings;
    private audioSettings: AudioSettings;
    private keybindingEditor: KeybindingEditor;

    constructor(gameLoop: any) {
        super('settings-modal');
        this.gameLoop = gameLoop;

        this.generalSettings = new GeneralSettings(
            this.container,
            gameLoop,
            this.setupDropdown.bind(this),
            this.updateDropdownVisuals.bind(this)
        );
        this.videoSettings = new VideoSettings(
            this.container,
            this.setupDropdown.bind(this),
            this.updateDropdownVisuals.bind(this)
        );
        this.audioSettings = new AudioSettings(this.container);
        this.keybindingEditor = new KeybindingEditor(this.container);

        this.render();
        this.attachListeners();
    }

    protected render(): void {
        this.container.innerHTML = TemplateEngine.render(settingsTemplate, {
            generalSettings: this.generalSettings,
            videoSettings: this.videoSettings,
            audioSettings: this.audioSettings,
            keybindingEditor: this.keybindingEditor
        });
    }

    private attachListeners() {
        const closeBtn = this.container.querySelector('#btn-settings-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        this.generalSettings.attachListeners();
        this.videoSettings.attachListeners();
        this.audioSettings.attachListeners();
        this.keybindingEditor.attachListeners();

        eventBus.on(GameEventType.DOCUMENT_KEYDOWN, (e) => this.handleGlobalKeydown(e));
    }

    private handleGlobalKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && this.isVisible) {
            this.hide();
        }
    }

    protected onShow() {
        const difficultyRow = this.container.querySelector('#difficulty-row') as HTMLElement;
        const difficultyDropdown = this.container.querySelector('#ai-difficulty-dropdown') as HTMLElement;
        const isGameStarted = this.gameLoop.currentState !== GameState.MAIN_MENU &&
                             this.gameLoop.currentState !== GameState.SETUP_BOARD;

        if (difficultyRow && difficultyDropdown) {
            difficultyRow.style.opacity = isGameStarted ? '0.5' : '1';
            difficultyDropdown.style.pointerEvents = isGameStarted ? 'none' : 'auto';
            if (isGameStarted) difficultyDropdown.classList.add('disabled');
            else difficultyDropdown.classList.remove('disabled');
        }

        this.updateDropdownVisuals('ai-difficulty-dropdown', Config.aiDifficulty);
        this.updateDropdownVisuals('game-speed-dropdown', Config.timing.gameSpeedMultiplier.toString());
        this.updateDropdownVisuals('fps-cap-dropdown', Config.visual.fpsCap.toString());
        this.updateDropdownVisuals('theme-dropdown', Config.visual.colorScheme);
    }

    private setupDropdown(id: string, callback: (val: string) => void) {
        const dropdown = this.container.querySelector(`#${id}`) as HTMLElement;
        if (!dropdown) return;

        const selected = dropdown.querySelector('.custom-dropdown-selected') as HTMLElement;
        const optionsContainer = dropdown.querySelector('.custom-dropdown-options') as HTMLElement;
        const options = dropdown.querySelectorAll('.custom-dropdown-option');

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = optionsContainer.style.display === 'block';
            
            // Close all other dropdowns first
            this.container.querySelectorAll('.custom-dropdown-options').forEach(el => {
                (el as HTMLElement).style.display = 'none';
            });

            optionsContainer.style.display = isOpen ? 'none' : 'block';
        });

        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = (option as HTMLElement).dataset.value!;
                
                options.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                this.updateDropdownVisuals(id, val);
                optionsContainer.style.display = 'none';
                callback(val);
            });
        });

        // Close dropdown when clicking outside (within container)
        this.container.addEventListener('click', () => {
            optionsContainer.style.display = 'none';
        });
    }

    private updateDropdownVisuals(id: string, value: string) {
        const dropdown = this.container.querySelector(`#${id}`) as HTMLElement;
        if (!dropdown) return;

        const selectedText = dropdown.querySelector(`#${id.replace('-dropdown', '')}-selected-text`) as HTMLElement;
        const options = dropdown.querySelectorAll('.custom-dropdown-option');

        let displayLabel = value;
        
        options.forEach(opt => {
            const optVal = (opt as HTMLElement).dataset.value;
            const check = opt.querySelector('.option-check') as HTMLElement;
            if (optVal === value) {
                opt.classList.add('active');
                if (check) check.innerHTML = '✔';
                const text = opt.querySelector('.option-text')?.textContent || value;
                displayLabel = text;
            } else {
                opt.classList.remove('active');
                if (check) check.innerHTML = '&nbsp;';
            }
        });

        if (selectedText) {
            selectedText.textContent = `✔ ${displayLabel}`;
        }
    }
}
