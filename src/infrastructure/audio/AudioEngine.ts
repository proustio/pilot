import { Config } from '../config/Config';

export class AudioEngine {
    private ctx: AudioContext | null = null;
    private static instance: AudioEngine;
    private masterVolume: number = Config.audio.masterVolume;

    private constructor() {
        this.masterVolume = Config.audio.masterVolume;
    }

    private ensureContext() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
            console.warn('AudioContext not supported', e);
        }
    }

    public static getInstance(): AudioEngine {
        if (!AudioEngine.instance) {
            AudioEngine.instance = new AudioEngine();
        }
        return AudioEngine.instance;
    }

    public setVolume(volume: number) {
        this.masterVolume = volume;
    }

    public resume() {
        this.ensureContext();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(e => console.warn('Audio resume failed', e));
        }
    }

    private playTone(freqStart: number, freqEnd: number, duration: number, type: OscillatorType = 'sine', volStart: number = 0.5, volEnd: number = 0) {
        if (!this.ctx || this.masterVolume <= 0) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 0.01), this.ctx.currentTime + duration);

        const realVolStart = volStart * this.masterVolume;
        const realVolEnd = volEnd * this.masterVolume;

        gainNode.gain.setValueAtTime(realVolStart, this.ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(realVolEnd, this.ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    private playNoise(duration: number, volStart: number = 0.5, volEnd: number = 0, filterType: BiquadFilterType = 'lowpass', filterFreq: number = 1000) {
        if (!this.ctx || this.masterVolume <= 0) return;
        this.resume();

        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = filterType;
        noiseFilter.frequency.value = filterFreq;

        const gainNode = this.ctx.createGain();
        const realVolStart = volStart * this.masterVolume;
        const realVolEnd = volEnd * this.masterVolume;

        gainNode.gain.setValueAtTime(realVolStart, this.ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(realVolEnd, this.ctx.currentTime + duration);

        noise.connect(noiseFilter);
        noiseFilter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        noise.start();
    }

    public playShoot() {
        this.playTone(800, 100, 0.3, 'square', 0.2, 0.01);
        this.playNoise(0.2, 0.3, 0.01);
    }

    public playSplash() {
        this.playNoise(0.5, 0.5, 0.01);
        this.playTone(300, 50, 0.4, 'sine', 0.3, 0.01);
    }

    public playHit() {
        this.playTone(150, 40, 0.4, 'square', 0.6, 0.01);
        this.playNoise(0.4, 0.6, 0.01);
    }

    public playKill() {
        // BA: Sharp initial punch (High freq transient dropping fast)
        this.playTone(400, 60, 0.1, 'sine', 1.0, 0);
        this.playNoise(0.1, 0.8, 0, 'highpass', 1000); // Sharp slap

        // BOOOM: Deep body and sub (Layered for thickness)
        this.playTone(60, 30, 0.8, 'sine', 1.2, 0);
        this.playTone(80, 20, 0.6, 'sawtooth', 0.5, 0); // Grit in the middle

        // CRACKLE: Mechanical stress / debris
        setTimeout(() => {
            this.playNoise(0.4, 0.6, 0, 'bandpass', 3500);
            this.playTone(150, 40, 0.4, 'square', 0.3, 0); // Added metallic stress
        }, 60);

        // RUMBLE: Massive tail
        this.playNoise(2.5, 0.7, 0, 'lowpass', 150);
        this.playNoise(1.8, 0.4, 0, 'lowpass', 400); // Thicker rumble
    }

    public playPop(frequency: number = 400) {
        this.playTone(frequency, frequency * 2, 0.05, 'sine', 0.2, 0.01);
    }
}


