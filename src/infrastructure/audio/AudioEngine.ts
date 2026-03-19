export class AudioEngine {
    private ctx: AudioContext | null = null;
    private static instance: AudioEngine;

    private constructor() {
        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
            console.warn('AudioContext not supported or blocked', e);
        }
    }

    public static getInstance(): AudioEngine {
        if (!AudioEngine.instance) {
            AudioEngine.instance = new AudioEngine();
        }
        return AudioEngine.instance;
    }

    public resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    private playTone(freqStart: number, freqEnd: number, duration: number, type: OscillatorType = 'sine', volStart: number = 0.5, volEnd: number = 0) {
        if (!this.ctx) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 0.01), this.ctx.currentTime + duration);

        gainNode.gain.setValueAtTime(volStart, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(volEnd, 0.01), this.ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    private playNoise(duration: number, volStart: number = 0.5, volEnd: number = 0.01) {
        if (!this.ctx) return;
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
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 1000;

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(volStart, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(volEnd, 0.01), this.ctx.currentTime + duration);

        noise.connect(noiseFilter);
        noiseFilter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        noise.start();
    }

    public playShoot() {
        this.playTone(800, 100, 0.3, 'square', 0.2, 0.01);
        this.playNoise(0.2, 0.3, 0.01); // Adds some texture to the shot
    }

    public playSplash() {
        this.playNoise(0.5, 0.5, 0.01);
        // A little downward sweep to simulate water entry
        this.playTone(300, 50, 0.4, 'sine', 0.3, 0.01);
    }

    public playHit() {
        this.playTone(150, 40, 0.4, 'square', 0.6, 0.01);
        this.playNoise(0.4, 0.6, 0.01);
    }

    public playKill() {
        // Multi-layered explosion sound
        this.playTone(200, 20, 0.8, 'sawtooth', 0.8, 0.01);
        this.playTone(100, 10, 0.8, 'square', 0.6, 0.01);
        this.playNoise(0.8, 1.0, 0.01);

        setTimeout(() => {
            this.playTone(150, 20, 0.6, 'sawtooth', 0.6, 0.01);
            this.playNoise(0.6, 0.8, 0.01);
        }, 100);
    }

    public playPop(frequency: number = 400) {
        // A short, high-pitched "bubble pop" sound
        // Quick upward sine sweep
        this.playTone(frequency, frequency * 2, 0.05, 'sine', 0.2, 0.01);
    }
}


