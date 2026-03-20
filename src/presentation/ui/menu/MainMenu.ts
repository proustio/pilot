import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';
import { Match, MatchMode } from '../../../domain/match/Match';
import { Config } from '../../../infrastructure/config/Config';

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
            image: '/assets/classic_mode_voxel_1773933296004.png',
            class: 'classic'
        },
        'russian': {
            name: 'Siberian Blockade',
            mana: 'russian',
            type: 'Advanced Strategic',
            features: ['Strict Non-Touching Adjacency', 'Russian Fleet (10 ships)', 'Maximum Tactical Precision'],
            flavor: '"In the cold north, even a single cell of contact is a fatal error."',
            stats: '🥵🥵🥵🥵',
            image: '/assets/russian_mode_voxel_1773933312011.png',
            class: 'russian'
        },
        'rogue': {
            name: 'Void Fleet Incursion',
            mana: 'rogue',
            type: 'Experimental Rogue',
            features: ['Variable Weaponry', 'Dynamic Moving Targets', 'Permadeath Elements'],
            flavor: '"The rules of engagement have changed. Adapt or be deleted."',
            stats: '☠️☠️☠️☠️☠️',
            image: '/assets/rogue_mode_voxel_1773933331120.png',
            class: 'rogue'
        }
    };

    constructor(gameLoop: GameLoop) {
        super('main-menu');
        this.gameLoop = gameLoop;
        // The panel style is now handled by .retro-console
        this.container.classList.remove('voxel-panel');
        this.container.style.width = 'auto'; 
    }

    protected render(): void {
        this.container.innerHTML = `
            <div class="retro-console">
                <!-- Left: Control Panel -->
                <div class="control-panel">
                    <span class="console-label">System: Operational</span>
                    <h1 class="voxel-title" style="font-size: 2rem; margin-bottom: 20px; text-align: left;">Battleships</h1>
                    
                    <div id="new-game-section" style="width: 100%; display: flex; flex-direction: column; gap: 10px;">
                        <div style="margin-top: 5px; display: flex; align-items: center; gap: 15px;">
                            <label class="console-label" for="auto-battler-toggle" style="margin-bottom: 0;">Auto-Battler</label>
                            <input type="checkbox" id="auto-battler-toggle" ${Config.autoBattler ? 'checked' : ''} style="transform: scale(1.5); cursor: pointer;">
                        </div>

                        <button id="btn-new-game" class="voxel-btn primary engage-btn" style="margin-top: 20px;">ENGAGE</button>
                    </div>

                    <div style="margin-top: auto; padding-top: 20px; border-top: 2px dashed #444; display: flex; flex-direction: column; gap: 10px;">
                        <button id="btn-game-saves" class="voxel-btn" style="width: 100%;">Memory Banks</button>
                        <div style="display: flex; gap: 10px;">
                            <button id="btn-settings" class="voxel-btn" style="flex: 1;">Settings</button>
                        </div>
                    </div>
                </div>

                <!-- Right: Monitor Port -->
                <div class="monitor-port" style="flex-direction: column; padding: 20px; justify-content: flex-start; gap: 15px;">
                    <div style="width: 100%; max-width: 240px; z-index: 20;">
                         <label class="console-label" for="mode-select" style="color: #0f0; text-shadow: 0 0 5px rgba(0,255,0,0.5);">Select Engagement:</label>
                         <select id="mode-select" class="voxel-select" style="margin-bottom: 0; background: rgba(0,20,0,0.8); border-color: #0f0; color: #0f0;">
                            <option value="classic">Classic (US Fleet)</option>
                            <option value="russian">Russian (No Touching)</option>
                            <option disabled="true" value="rogue">Rogue (Coming Soon?)</option>
                        </select>
                    </div>

                    <div id="mtg-card-anchor" class="mtg-card-container" style="margin-top: 0; transform: scale(0.85); flex: 0;">
                        <!-- Card injected here dynamically -->
                    </div>
                </div>
            </div>
        `;

        const newGameBtn = this.container.querySelector('#btn-new-game') as HTMLButtonElement;
        const modeSelect = this.container.querySelector('#mode-select') as HTMLSelectElement;
        const autoBattlerToggle = this.container.querySelector('#auto-battler-toggle') as HTMLInputElement;
        const cardAnchor = this.container.querySelector('#mtg-card-anchor') as HTMLElement;

        const updateCard = (mode: string) => {
            const meta = this.modeMetadata[mode];
            if (!meta) return;

            cardAnchor.innerHTML = `
                <div class="mtg-card ${meta.class}">
                    <div class="mtg-card-header">
                        <span class="mtg-card-name">${meta.name}</span>
                        <span class="mtg-card-mana">${meta.mana}</span>
                    </div>
                    <div class="mtg-card-image-container">
                        <img src="${meta.image}" alt="${meta.name}" class="mtg-card-image">
                    </div>
                    <div class="mtg-card-type">
                        Game Mode &mdash; ${meta.type}
                    </div>
                    <div class="mtg-card-text-box">
                        <ul class="mtg-card-features">
                            ${meta.features.map((f: string) => `<li>${f}</li>`).join('')}
                        </ul>
                        <p class="mtg-card-flavor">${meta.flavor}</p>
                    </div>
                    <div class="mtg-card-footer">
                        <span class="mtg-card-power-toughness">${meta.stats}</span>
                    </div>
                </div>
            `;
        };

        // Initial card update
        updateCard(modeSelect.value);

        modeSelect.addEventListener('change', () => {
            updateCard(modeSelect.value);
        });

        newGameBtn.addEventListener('click', () => {
            const modeValue = modeSelect.value as string;
            Config.autoBattler = autoBattlerToggle.checked;
            Config.saveConfig();

            let matchMode = MatchMode.Classic;

            if (modeValue === 'russian') {
                matchMode = MatchMode.Russian;
            } else if (modeValue === 'rogue') {
                console.warn('Rogue mode placeholder selected. Defaulting to Classic.');
                matchMode = MatchMode.Classic;
            }

            const match = new Match(matchMode, Config.board.width, Config.board.height);
            this.gameLoop.startNewMatch(match);
        });

        const gameSavesBtn = this.container.querySelector('#btn-game-saves') as HTMLButtonElement;
        gameSavesBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('SHOW_LOAD_DIALOG'));
        });

        const settingsBtn = this.container.querySelector('#btn-settings') as HTMLButtonElement;
        settingsBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('SHOW_SETTINGS'));
        });

        document.addEventListener('TOGGLE_AUTO_BATTLER', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.enabled !== undefined) {
                autoBattlerToggle.checked = ce.detail.enabled;
            }
        });
    }
}
