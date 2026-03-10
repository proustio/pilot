import { BaseUIComponent } from '../components/BaseUIComponent';

export class Settings extends BaseUIComponent {
    constructor() {
        super('settings-modal');
        this.container.classList.add('voxel-panel');
        // Let's place it high z-index
        this.container.style.zIndex = '100';
    }

    protected render(): void {
        this.container.innerHTML = `
            <h2 class="voxel-title" style="font-size: 2rem;">Settings</h2>
            
            <div class="settings-row">
                <label>Enemy AI Difficulty:</label>
                <select id="ai-difficulty" class="voxel-select" style="width: auto;">
                    <option value="easy">Easy (Random)</option>
                    <option value="normal">Normal (Hunt/Target)</option>
                    <option value="hard">Hard (Probabilistic)</option>
                </select>
            </div>

            <div class="settings-row">
                <label>Show HUD:</label>
                <input type="checkbox" id="toggle-hud" checked style="transform: scale(2);">
            </div>

            <div class="settings-row">
                <label>Flip Speed:</label>
                <input type="range" id="flip-speed" min="0.01" max="0.3" step="0.01" value="0.05" style="width: 150px;">
            </div>
            
            <button id="btn-close-settings" class="voxel-btn primary" style="margin-top: 20px;">Close</button>
        `;

        // Bind events
        const closeBtn = this.container.querySelector('#btn-close-settings') as HTMLButtonElement;
        closeBtn.addEventListener('click', () => {
            this.hide();
        });

        const toggleHud = this.container.querySelector('#toggle-hud') as HTMLInputElement;
        toggleHud.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            document.dispatchEvent(new CustomEvent('TOGGLE_HUD', { detail: { show: isChecked } }));
        });
        
        const flipSpeed = this.container.querySelector('#flip-speed') as HTMLInputElement;
        flipSpeed.addEventListener('input', (e) => {
            const speed = (e.target as HTMLInputElement).value;
            document.dispatchEvent(new CustomEvent('SET_FLIP_SPEED', { detail: { speed } }));
        });
        
        const aiSelect = this.container.querySelector('#ai-difficulty') as HTMLSelectElement;
        aiSelect.addEventListener('change', (e) => {
            const difficulty = (e.target as HTMLSelectElement).value;
            // dispatch custom event to AI system later
            console.log("AI Difficulty set to: ", difficulty);
        });
    }
}
