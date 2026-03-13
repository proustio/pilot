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
        gameSpeedMultiplier: 1.0,     // 0.5x, 1x, 2x, 4x
        aiThinkingTimeMs: 1000,       // Base AI thinking delay
        turnDelayMs: 2000,            // Base post-turn observation delay
        boardFlipSpeed: 0.05,         // Base lerp speed for board flip
        projectileSpeed: 0.04,        // Base increment per frame for projectile progress
        cameraLerpSpeed: 0.05,        // Base lerp speed for camera movement
        boardFlipWaitMs: 100          // ms to wait after board flip before enemy/auto-battler fires
    },
    visual: {
        isDayMode: new Date().getHours() >= 6 && new Date().getHours() < 18,
        showGeekStats: false,
        peekEnabled: true
    },
    autoBattler: false,
    aiDifficulty: 'normal',

    loadConfig() {
        try {
            const savedConfig = localStorage.getItem('battleships_config');
            if (savedConfig) {
                const parsedConfig = JSON.parse(savedConfig);

                // Copy settings that should be persisted
                if (parsedConfig.timing?.gameSpeedMultiplier !== undefined) {
                    this.timing.gameSpeedMultiplier = parsedConfig.timing.gameSpeedMultiplier;
                }
                if (parsedConfig.visual?.isDayMode !== undefined) {
                    this.visual.isDayMode = parsedConfig.visual.isDayMode;
                }
                if (parsedConfig.visual?.showGeekStats !== undefined) {
                    this.visual.showGeekStats = parsedConfig.visual.showGeekStats;
                }
                if (parsedConfig.visual?.peekEnabled !== undefined) {
                    this.visual.peekEnabled = parsedConfig.visual.peekEnabled;
                }
                if (parsedConfig.autoBattler !== undefined) {
                    this.autoBattler = parsedConfig.autoBattler;
                }
                if (parsedConfig.aiDifficulty !== undefined) {
                    this.aiDifficulty = parsedConfig.aiDifficulty;
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
                    peekEnabled: this.visual.peekEnabled
                },
                autoBattler: this.autoBattler,
                aiDifficulty: this.aiDifficulty
            };
            localStorage.setItem('battleships_config', JSON.stringify(configToSave));
        } catch (e) {
            console.error('Failed to save user config', e);
        }
    }
};
