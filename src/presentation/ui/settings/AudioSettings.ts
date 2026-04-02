import { Config } from '../../../infrastructure/config/Config';
import { AudioEngine } from '../../../infrastructure/audio/AudioEngine';
import { TemplateEngine } from '../templates/TemplateEngine';
import audioSettingsTemplate from '../templates/AudioSettings.html?raw';

export class AudioSettings {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    public render(): string {
        return TemplateEngine.render(audioSettingsTemplate, {
            Config: Config,
            Math: Math
        });
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
