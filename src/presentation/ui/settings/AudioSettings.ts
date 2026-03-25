import { Config } from '../../../infrastructure/config/Config';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';

export class AudioSettings {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    public render(): string {
        return `
            <div class="settings-row">
                <label>Master Volume:</label>
                <input type="range" id="sound-volume" min="0" max="1" step="0.05" value="${Config.audio.masterVolume}" class="voxel-slider" style="flex-grow: 1; margin-left: 20px;">
                <span id="volume-value" style="width: 40px; text-align: right;">${Math.round(Config.audio.masterVolume * 100)}%</span>
            </div>
        `;
    }

    public attachListeners(): void {
        const volumeSlider = this.container.querySelector('#sound-volume') as HTMLInputElement;
        const volumeValue = this.container.querySelector('#volume-value') as HTMLElement;
        
        if (volumeSlider && volumeValue) {
            volumeSlider.addEventListener('input', (e) => {
                const val = parseFloat((e.target as HTMLInputElement).value);
                volumeValue.textContent = `${Math.round(val * 100)}%`;
                Config.audio.masterVolume = val;
                Config.saveConfig();
                AudioEngine.getInstance().setVolume(val);
            });
        }
    }
}
