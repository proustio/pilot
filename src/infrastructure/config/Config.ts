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
        cameraLerpSpeed: 0.05         // Base lerp speed for camera movement
    },
    visual: {
        isDayMode: new Date().getHours() >= 6 && new Date().getHours() < 18
    },
    autoBattler: false
};
