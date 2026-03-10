import { BaseUIComponent } from '../components/BaseUIComponent';
import { GameLoop } from '../../../application/game-loop/GameLoop';
import { Match, MatchMode } from '../../../domain/match/Match';

export class MainMenu extends BaseUIComponent {
    private gameLoop: GameLoop;

    constructor(gameLoop: GameLoop) {
        super('main-menu');
        this.gameLoop = gameLoop;
        this.container.classList.add('voxel-panel');
    }

    protected render(): void {
        this.container.innerHTML = `
            <h1 class="voxel-title">Battleships</h1>
            
            <div id="new-game-section" style="width: 100%;">
                <label for="mode-select">Select Mode:</label>
                <select id="mode-select" class="voxel-select">
                    <option value="classic">Classic (US Fleet)</option>
                    <option value="russian">Russian (No Touching)</option>
                    <option value="rogue">Rogue (Placeholder)</option>
                </select>
                <button id="btn-new-game" class="voxel-btn primary">New Game</button>
            </div>

            <div style="margin-top: 20px; width: 100%; border-top: 2px dashed #555; padding-top: 20px;">
                <label>Load Game (Coming Soon):</label>
                <button class="voxel-btn" disabled>Slot 1</button>
                <button class="voxel-btn" disabled>Slot 2</button>
                <button class="voxel-btn" disabled>Slot 3</button>
            </div>
            
            <button id="btn-settings" class="voxel-btn" style="margin-top: 20px;">Settings</button>
        `;

        // Bind events
        const newGameBtn = this.container.querySelector('#btn-new-game') as HTMLButtonElement;
        const modeSelect = this.container.querySelector('#mode-select') as HTMLSelectElement;

        newGameBtn.addEventListener('click', () => {
            const modeValue = modeSelect.value as string;
            let matchMode = MatchMode.Classic;
            
            if (modeValue === 'russian') {
                matchMode = MatchMode.Russian;
            } else if (modeValue === 'rogue') {
                // Not supported yet, fallback to Classic
                console.warn('Rogue mode placeholder selected. Defaulting to Classic.');
                matchMode = MatchMode.Classic;
            }

            const match = new Match(matchMode);
            this.gameLoop.startNewMatch(match);
        });
        
        const settingsBtn = this.container.querySelector('#btn-settings') as HTMLButtonElement;
        settingsBtn.addEventListener('click', () => {
            // Need to expose a way to show settings
            document.dispatchEvent(new CustomEvent('SHOW_SETTINGS'));
        });
    }
}
