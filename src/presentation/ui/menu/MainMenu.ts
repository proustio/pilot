import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';
import { Match, MatchMode } from '../../../domain/match/Match';
import { Config } from '../../../infrastructure/config/Config';
import { Storage } from '../../../infrastructure/storage/Storage';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { TemplateEngine } from '../templates/TemplateEngine';
import mainMenuTemplate from '../templates/MainMenu.html?raw';
import modeCardTemplate from '../templates/ModeCard.html?raw';

export class MainMenu extends BaseUIComponent {
    private gameLoop: GameLoop;
    private modeMetadata: Record<string, any> = {
        'classic': {
            name: 'US Fleet Engagement',
            mana: 'classic',
            type: 'Tactical Standard',
            features: ['Standard 10x10 Grid', 'US Navy Fleet (5 ships)', 'Classic Placement rules'],
            flavor: '"Old school tactics for a new age of voxel warfare."',
            stats: '😌😌😌',
            image: '/assets/classic-battleships.png',
            class: 'classic'
        },
        'russian': {
            name: 'Siberian Blockade',
            mana: 'russian',
            type: 'Advanced Strategic',
            features: ['Strict Non-Touching Adjacency', 'Russian Fleet (10 ships)', 'Maximum Tactical Precision'],
            flavor: '"In the cold north, even a single cell of contact is a fatal error."',
            stats: '🥵🥵🥵🥵',
            image: '/assets/russian-battleships.png',
            class: 'russian'
        },
        'rogue': {
            name: 'Void Fleet Incursion',
            mana: 'rogue',
            type: 'Experimental Rogue',
            features: ['Variable Weaponry', 'Dynamic Moving Targets', 'Permadeath Elements'],
            flavor: '"The rules of engagement have changed. Adapt or be deleted."',
            stats: '☠️☠️☠️☠️☠️',
            image: '/assets/rogue-battleships.png',
            class: 'rogue'
        }
    };

    constructor(gameLoop: GameLoop) {
        super('main-menu');
        this.gameLoop = gameLoop;
        this.container.classList.add('absolute', 'top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2', 'scale-120', 'flex', 'flex-col', 'items-center', 'justify-center', 'z-[200]', 'pointer-events-auto');
    }

    protected render(): void {
        this.container.innerHTML = TemplateEngine.render(mainMenuTemplate, { Config: Config });

        const newGameBtn = this.container.querySelector('#btn-new-game') as HTMLButtonElement;
        const themeToggle = this.container.querySelector('#theme-toggle') as HTMLInputElement;
        const cardAnchor = this.container.querySelector('#mtg-card-anchor') as HTMLElement;

        // --- Custom Dropdown Logic ---
        let selectedMode = Config.preferredMode || 'classic';

        const dropdownEl = this.container.querySelector('#mode-dropdown') as HTMLElement;
        const selectedEl = this.container.querySelector('#dropdown-selected') as HTMLElement;
        const selectedTextEl = this.container.querySelector('#dropdown-selected-text') as HTMLElement;
        const allOptions = this.container.querySelectorAll('.custom-dropdown-option') as NodeListOf<HTMLElement>;

        const optionDisplay: Record<string, string> = {
            classic: '✔ Classic (US Fleet)',
            russian: '❄ Russian (No Touching)',
            rogue: '☠ Rogue (Action)',
        };

        const closeDropdown = () => dropdownEl.classList.remove('open');

        selectedEl.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownEl.classList.toggle('open');
        });

        allOptions.forEach((opt) => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = opt.dataset.value as 'classic' | 'russian' | 'rogue';
                selectedMode = value;
                selectedTextEl.textContent = optionDisplay[value];

                Config.preferredMode = value as any;
                Config.saveConfig();

                allOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');

                closeDropdown();
                updateCard(selectedMode);
            });
        });

        // Close on outside click
        eventBus.on(GameEventType.DOCUMENT_CLICK, closeDropdown);

        // --- Rogue state ---
        const updateRogueState = (mode: string) => {
            const isRogue = mode === 'rogue';
            if (isRogue) {
                cardAnchor.classList.add('rogue-selected');
            } else {
                cardAnchor.classList.remove('rogue-selected');
            }
            newGameBtn.textContent = 'ENGAGE';
        };

        const updateCard = (mode: string) => {
            const meta = this.modeMetadata[mode];
            if (!meta) return;

            cardAnchor.innerHTML = TemplateEngine.render(modeCardTemplate, { meta: meta });

            updateRogueState(mode);
        };

        // Initialize dropdown UI state
        selectedTextEl.textContent = optionDisplay[selectedMode];
        allOptions.forEach(opt => {
            if (opt.dataset.value === selectedMode) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });

        // Initial card
        updateCard(selectedMode);

        newGameBtn.addEventListener('click', () => {
            Config.saveConfig();

            let matchMode = MatchMode.Classic;
            let width = 10;
            let height = 10;
            let rogueMode = false;

            if (selectedMode === 'russian') {
                matchMode = MatchMode.Russian;
            } else if (selectedMode === 'rogue') {
                matchMode = MatchMode.Rogue;
                width = Config.board.rogueWidth;
                height = Config.board.rogueHeight;
                rogueMode = true;
            }

            const match = new Match(matchMode, width, height);

            if (Config.board.width !== width || Config.rogueMode !== rogueMode) {
                Config.board.width = width;
                Config.board.height = height;
                Config.rogueMode = rogueMode;
                Config.saveConfig();

                Storage.clearSession(); // Ensure no auto-load on refresh
                sessionStorage.setItem('battleships_new_match_mode', matchMode);
                window.location.reload();
                return;
            }

            this.gameLoop.startNewMatch(match);
        });

        const gameSavesBtn = this.container.querySelector('#btn-game-saves') as HTMLButtonElement;
        gameSavesBtn.addEventListener('click', () => {
            eventBus.emit(GameEventType.SHOW_LOAD_DIALOG, undefined as any);
        });

        const settingsBtn = this.container.querySelector('#btn-settings') as HTMLButtonElement;
        settingsBtn.addEventListener('click', () => {
            eventBus.emit(GameEventType.SHOW_SETTINGS, undefined as any);
        });

        if (themeToggle) {
            themeToggle.addEventListener('change', () => {
                Config.visual.isDayMode = themeToggle.checked;
                Config.saveConfig();
                eventBus.emit(GameEventType.TOGGLE_DAY_NIGHT, undefined as any);
                eventBus.emit(GameEventType.THEME_CHANGED, undefined as any);
            });
        }

        eventBus.on(GameEventType.TOGGLE_DAY_NIGHT, () => {
            if (themeToggle) {
                themeToggle.checked = Config.visual.isDayMode;
            }
        });
    }
}
