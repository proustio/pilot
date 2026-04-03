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
        this.container.classList.add(
            'fixed', 'inset-0', 'bg-black/70', 'backdrop-blur-sm',
            'flex', 'items-center', 'justify-center',
            'z-[200]', 'pointer-events-auto'
        );
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
    }

    protected render(): void {
        this.container.innerHTML = TemplateEngine.render(settingsTemplate, {
            generalSettings: this.generalSettings,
            videoSettings: this.videoSettings,
            audioSettings: this.audioSettings,
            keybindingEditor: this.keybindingEditor
        });

        // Attach listeners after every render (mount() re-calls render())
        const closeBtn = this.container.querySelector('#btn-settings-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('[Settings] Close button pressed');
                this.hide();
            });
        }

        this.generalSettings.attachListeners();
        this.videoSettings.attachListeners();
        this.audioSettings.attachListeners();
        this.keybindingEditor.attachListeners();
        this.attachPurgeListeners();

        eventBus.on(GameEventType.DOCUMENT_KEYDOWN, (e) => this.handleGlobalKeydown(e));
    }

    private handleGlobalKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && this.isVisible) {
            const purgeOverlay = this.container.querySelector('#settings-purge-confirm-overlay') as HTMLElement;
            if (purgeOverlay && !purgeOverlay.classList.contains('hidden')) {
                purgeOverlay.classList.add('hidden');
                return;
            }
            this.hide();
        }
    }

    private attachPurgeListeners(): void {
        const purgeBtn = this.container.querySelector('#btn-settings-purge') as HTMLButtonElement;
        const purgeOverlay = this.container.querySelector('#settings-purge-confirm-overlay') as HTMLElement;
        const purgeYesBtn = this.container.querySelector('#settings-purge-confirm-yes') as HTMLButtonElement;
        const purgeNoBtn = this.container.querySelector('#settings-purge-confirm-no') as HTMLButtonElement;

        if (purgeBtn && purgeOverlay) {
            purgeBtn.addEventListener('click', () => {
                purgeOverlay.classList.remove('hidden');
            });
        }

        if (purgeNoBtn && purgeOverlay) {
            purgeNoBtn.addEventListener('click', () => {
                purgeOverlay.classList.add('hidden');
            });
        }

        if (purgeYesBtn) {
            purgeYesBtn.addEventListener('click', () => {
                localStorage.clear();
                sessionStorage.clear();
                document.cookie.split(';').forEach((c) => {
                    document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
                });
                if ('caches' in window) {
                    caches.keys().then((names) => {
                        names.forEach(name => {
                            caches.delete(name);
                        });
                    });
                }
                eventBus.emit(GameEventType.EXIT_GAME, undefined as any);
                window.location.reload();
            });
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

        // Store original parent so we can return the node on close
        const originalParent = optionsContainer.parentElement!;

        const closeAllDropdowns = () => {
            // Collect all portaled options and return them home
            document.querySelectorAll('.settings-dropdown-portal').forEach(el => {
                const elHtml = el as HTMLElement;
                const homeParent = elHtml.dataset.portalHome
                    ? document.querySelector(`#${elHtml.dataset.portalHome}`) as HTMLElement
                    : null;
                elHtml.style.display = 'none';
                elHtml.style.position = '';
                elHtml.style.top = '';
                elHtml.style.bottom = '';
                elHtml.style.left = '';
                elHtml.style.right = '';
                elHtml.style.width = '';
                elHtml.style.zIndex = '';
                elHtml.classList.remove('settings-dropdown-portal');
                if (homeParent && elHtml.parentElement !== homeParent) {
                    homeParent.appendChild(elHtml);
                }
            });
        };

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = optionsContainer.parentElement === document.body;

            // Close all other dropdowns first
            closeAllDropdowns();

            if (!isOpen) {
                const rect = selected.getBoundingClientRect();

                // Portal to body so it escapes all containing blocks (backdrop-blur etc.)
                optionsContainer.dataset.portalHome = dropdown.id;
                optionsContainer.classList.add('settings-dropdown-portal');
                document.body.appendChild(optionsContainer);

                optionsContainer.style.position = 'fixed';
                optionsContainer.style.left = `${rect.left}px`;
                optionsContainer.style.right = 'auto';
                optionsContainer.style.width = `${rect.width}px`;
                optionsContainer.style.zIndex = '9999';
                optionsContainer.style.display = 'block';

                const optionsHeight = optionsContainer.scrollHeight;
                const spaceBelow = window.innerHeight - rect.bottom;

                if (spaceBelow < optionsHeight + 8) {
                    optionsContainer.style.top = 'auto';
                    optionsContainer.style.bottom = `${window.innerHeight - rect.top + 4}px`;
                } else {
                    optionsContainer.style.top = `${rect.bottom + 4}px`;
                    optionsContainer.style.bottom = 'auto';
                }
            }
        });

        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = (option as HTMLElement).dataset.value!;

                options.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');

                this.updateDropdownVisuals(id, val);
                closeAllDropdowns();
                callback(val);
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            closeAllDropdowns();
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
