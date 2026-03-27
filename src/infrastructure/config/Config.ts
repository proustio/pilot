export const Config = {
    version: '0.1.0',
    board: {
        width: 20,
        height: 20
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
        colorScheme: 'default' as 'default' | 'grayscale' | 'custom',
        customColors: {
            playerShip: '#50C878',
            enemyShip: '#8D2B00',
            waterPrimary: '#00563F',
            waterSecondary: '#3D5E42',
            boardLines: '#2C3F50',
            industrialBase: '#050515',
            rivet: '#444455',
            screw: '#444444'
        },
        showGeekStats: true,
        fpsCap: 30,
        sinkingFloor: -0.08,
        sinkingMaxAngle: 0.25,
        shadowsEnabled: true,
        antialias: typeof navigator !== 'undefined' ? !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) : true
    },

    rogue: {
        fogRadius: 7,  // cells of personal fog halo around each ship
    },
    rogueMode: false,

    autoBattler: false,
    aiDifficulty: 'normal',
    audio: {
        masterVolume: 0.5
    },
    preferredMode: 'classic' as 'classic' | 'russian' | 'rogue',
    network: {
        serverUrl: null as string | null
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
                if (parsedConfig.visual?.colorScheme !== undefined) {
                    this.visual.colorScheme = parsedConfig.visual.colorScheme;
                }
                if (parsedConfig.visual?.customColors !== undefined) {
                    this.visual.customColors = { ...this.visual.customColors, ...parsedConfig.visual.customColors };
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
                if (parsedConfig.board?.width !== undefined) {
                    this.board.width = parsedConfig.board.width;
                    this.board.height = parsedConfig.board.height;
                }
                if (parsedConfig.rogueMode !== undefined) {
                    this.rogueMode = parsedConfig.rogueMode;
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
                if (parsedConfig.preferredMode !== undefined) {
                    this.preferredMode = parsedConfig.preferredMode;
                }
                if (parsedConfig.keybindings !== undefined) {
                    this.keybindings = { ...this.keybindings, ...parsedConfig.keybindings };
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
                    colorScheme: this.visual.colorScheme,
                    customColors: this.visual.customColors,
                    showGeekStats: this.visual.showGeekStats,
                    fpsCap: this.visual.fpsCap,
                    shadowsEnabled: this.visual.shadowsEnabled,
                    antialias: this.visual.antialias
                },
                board: {
                    width: this.board.width,
                    height: this.board.height
                },
                rogueMode: this.rogueMode,
                autoBattler: this.autoBattler,
                aiDifficulty: this.aiDifficulty,
                audio: {
                    masterVolume: this.audio.masterVolume
                },
                preferredMode: this.preferredMode,
                keybindings: this.keybindings
            };
            localStorage.setItem('battleships_config', JSON.stringify(configToSave));
        } catch (e) {
            console.error('Failed to save user config', e);
        }
    },

    keybindings: {
        'ToggleMoveSection': ['m'],
        'ToggleAttackSection': ['a'],
        'ActionSail': ['s'],
        'ActionPing': ['p'],
        'ActionMine': ['m'],
        'ActionCannon': ['c'],
        'ActionAirStrike': ['a'],
        'RotateWeapon': ['r'],
        'SkipTurn': ['Enter', ' ']
    }
};
