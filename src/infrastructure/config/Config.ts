export const Config = {
    version: '0.1.0',
    board: {
        width: 10,
        height: 10
    },
    storage: {
        maxSlots: 3,
        prefix: 'battleships_save_'
    },
    timing: {
        gameSpeedMultiplier: 1.0,
        aiThinkingTimeMs: 2000,
        turnDelayMs: 1000,
        boardFlipSpeed: 0.05,
        projectileSpeed: 0.04,
        cameraLerpSpeed: 0.05,
        boardFlipWaitMs: 100
    },
    visual: {
        isDayMode: new Date().getHours() >= 6 && new Date().getHours() < 18,
        showGeekStats: true,
        fpsCap: 30,
        sinkingFloor: -0.08,
        sinkingMaxAngle: 0.25,
        shadowsEnabled: true,
        antialias: typeof navigator !== 'undefined' ? !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) : true
    },

    autoBattler: false,
    aiDifficulty: 'normal',
    audio: {
        masterVolume: 0.5
    },

    loadConfig() {
        try {
            const savedConfig = localStorage.getItem('battleships_config');
            if (savedConfig) {
                const parsedConfig = JSON.parse(savedConfig);

                if (parsedConfig.timing?.gameSpeedMultiplier !== undefined) {
                    this.timing.gameSpeedMultiplier = parsedConfig.timing.gameSpeedMultiplier;
                }
                if (parsedConfig.visual?.isDayMode !== undefined) {
                    this.visual.isDayMode = parsedConfig.visual.isDayMode;
                }
                if (parsedConfig.visual?.showGeekStats !== undefined) {
                    this.visual.showGeekStats = parsedConfig.visual.showGeekStats;
                }
                if (parsedConfig.visual?.fpsCap !== undefined) {
                    this.visual.fpsCap = parsedConfig.visual.fpsCap;
                }
                if (parsedConfig.visual?.shadowsEnabled !== undefined) {
                    this.visual.shadowsEnabled = parsedConfig.visual.shadowsEnabled;
                }
                if (parsedConfig.visual?.antialias !== undefined) {
                    this.visual.antialias = parsedConfig.visual.antialias;
                }
                if (parsedConfig.autoBattler !== undefined) {
                    this.autoBattler = parsedConfig.autoBattler;
                }
                if (parsedConfig.aiDifficulty !== undefined) {
                    this.aiDifficulty = parsedConfig.aiDifficulty;
                }
                if (parsedConfig.audio?.masterVolume !== undefined) {
                    this.audio.masterVolume = parsedConfig.audio.masterVolume;
                }
            }
        } catch (e) {
            console.error('Failed to load user config', e);
        }
    },

    saveConfig() {
        try {
            const configToSave = {
                timing: {
                    gameSpeedMultiplier: this.timing.gameSpeedMultiplier
                },
                visual: {
                    isDayMode: this.visual.isDayMode,
                    showGeekStats: this.visual.showGeekStats,
                    fpsCap: this.visual.fpsCap,
                    shadowsEnabled: this.visual.shadowsEnabled,
                    antialias: this.visual.antialias
                },
                autoBattler: this.autoBattler,
                aiDifficulty: this.aiDifficulty,
                audio: {
                    masterVolume: this.audio.masterVolume
                }
            };
            localStorage.setItem('battleships_config', JSON.stringify(configToSave));
        } catch (e) {
            console.error('Failed to save user config', e);
        }
    }
};
