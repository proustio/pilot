import { Config } from '../../../infrastructure/config/Config';
import { TemplateEngine } from '../templates/TemplateEngine';
import keybindingEditorTemplate from '../templates/KeybindingEditor.html?raw';
import keyboardVisualTemplate from '../templates/KeyboardVisual.html?raw';
import keybindingListTemplate from '../templates/KeybindingList.html?raw';

export class KeybindingEditor {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    public render(): string {
        return TemplateEngine.render(keybindingEditorTemplate, {});
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

        visualEl.innerHTML = TemplateEngine.render(keyboardVisualTemplate, {
            rows,
            allBinds
        });

        // Render Action List
        const actions = Object.keys(Config.keybindings);
        listEl.innerHTML = TemplateEngine.render(keybindingListTemplate, {
            actions,
            Config
        });

        // Handle Add/Remove via delegation
        listEl.querySelectorAll('.remove-bind').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = (btn as HTMLElement).dataset.action;
                const index = parseInt((btn as HTMLElement).dataset.index || '0', 10);
                (Config.keybindings as any)[action!].splice(index, 1);
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
                    (Config.keybindings as any)[action!].push(normalizedKey);
                    Config.saveConfig();
                    this.renderKeybindingList(visualEl, listEl);
                }
            });
        });
    }
}
