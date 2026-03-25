import { Config } from '../../../infrastructure/config/Config';

export class KeybindingEditor {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    public render(): string {
        return `
            <div class="settings-row">
                <label>Key Bindings:</label>
                <button id="btn-open-keybindings" class="voxel-btn secondary" style="flex-grow: 1; margin-left: 20px;">Configure...</button>
            </div>

            <div id="keybindings-sub-panel" class="sub-panel voxel-panel" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1000; box-sizing: border-box; overflow-y: auto; background-color: #111;">
                <h3 class="voxel-title">Key Bindings</h3>
                <p style="font-size: 0.8em; opacity: 0.7; margin-bottom: 10px;">Click a key to highlight it, or click an action to bind/unbind.</p>
                
                <div id="keyboard-visual" class="keyboard-visual" style="margin-bottom: 20px;"></div>
                
                <div id="keybindings-list" style="margin-top: 20px;"></div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button id="btn-close-keybindings" class="voxel-btn secondary" style="flex-grow: 1;">Back to General</button>
                    <button id="btn-reset-keybindings" class="voxel-btn danger" style="flex-grow: 1;">Reset to Defaults</button>
                </div>
            </div>
        `;
    }

    public attachListeners(): void {
        const openKeybindingsBtn = this.container.querySelector('#btn-open-keybindings') as HTMLButtonElement;
        const keybindingsPanel = this.container.querySelector('#keybindings-sub-panel') as HTMLElement;
        const closeKeybindingsBtn = this.container.querySelector('#btn-close-keybindings') as HTMLButtonElement;
        const resetKeybindingsBtn = this.container.querySelector('#btn-reset-keybindings') as HTMLButtonElement;
        const keyboardVisual = this.container.querySelector('#keyboard-visual') as HTMLElement;
        const keybindingsList = this.container.querySelector('#keybindings-list') as HTMLElement;

        if (openKeybindingsBtn && keybindingsPanel) {
            openKeybindingsBtn.addEventListener('click', () => {
                keybindingsPanel.style.display = 'block';
                this.renderKeybindingList(keyboardVisual, keybindingsList);
            });
        }

        if (closeKeybindingsBtn && keybindingsPanel) {
            closeKeybindingsBtn.addEventListener('click', () => {
                keybindingsPanel.style.display = 'none';
            });
        }

        if (resetKeybindingsBtn) {
            resetKeybindingsBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all key bindings to default?')) {
                    Config.keybindings = {
                        'ToggleMoveSection': ['m'],
                        'ToggleAttackSection': ['a'],
                        'ActionSail': ['s'],
                        'ActionPing': ['p'],
                        'ActionMine': ['m'],
                        'ActionCannon': ['c'],
                        'ActionAirStrike': ['a'],
                        'RotateWeapon': ['r'],
                        'SkipTurn': ['Enter', ' ']
                    };
                    Config.saveConfig();
                    this.renderKeybindingList(keyboardVisual, keybindingsList);
                }
            });
        }
    }

    private renderKeybindingList(visualEl: HTMLElement, listEl: HTMLElement) {
        if (!visualEl || !listEl) return;

        // Render simple visual keyboard
        const rows = [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
        ];
        
        const allBinds = Object.values(Config.keybindings).flat().map((k: any) => k.toUpperCase());

        visualEl.innerHTML = rows.map(row => `
            <div style="display: flex; justify-content: center; gap: 5px; margin-bottom: 5px;">
                ${row.map(key => {
                    const isBound = allBinds.includes(key);
                    return `
                    <div class="key-cap" 
                         style="width: 30px; height: 30px; border: 1px solid var(--panel-border); display: flex; align-items: center; justify-content: center; font-size: 0.8em; background: ${isBound ? 'var(--accent-color)' : 'transparent'}; opacity: ${isBound ? '1' : '0.5'};">
                        ${key}
                    </div>`;
                }).join('')}
            </div>
        `).join('');

        // Render Action List
        const actions = Object.keys(Config.keybindings);
        listEl.innerHTML = actions.map(action => {
            const binds = Config.keybindings[action as keyof typeof Config.keybindings];
            return `
                <div class="settings-row" style="margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">
                    <label style="font-size: 0.9em; flex-grow: 1;">${action}:</label>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        ${binds.map((key: string, idx: number) => `
                            <span class="key-bind-tag" style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">
                                ${key} <span class="remove-bind" data-action="${action}" data-index="${idx}">×</span>
                            </span>
                        `).join('')}
                        ${binds.length < 3 ? `<button class="voxel-btn mini add-bind" data-action="${action}" style="padding: 2px 6px; font-size: 0.8em;">+</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Handle Add/Remove via delegation
        listEl.querySelectorAll('.remove-bind').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = (btn as HTMLElement).dataset.action;
                const index = parseInt((btn as HTMLElement).dataset.index || '0', 10);
                Config.keybindings[action as keyof typeof Config.keybindings].splice(index, 1);
                Config.saveConfig();
                this.renderKeybindingList(visualEl, listEl);
            });
        });

        listEl.querySelectorAll('.add-bind').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = (btn as HTMLElement).dataset.action;
                const key = prompt(`Press a key to bind to ${action}:`);
                if (key) {
                    const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
                    Config.keybindings[action as keyof typeof Config.keybindings].push(normalizedKey);
                    Config.saveConfig();
                    this.renderKeybindingList(visualEl, listEl);
                }
            });
        });
    }
}
