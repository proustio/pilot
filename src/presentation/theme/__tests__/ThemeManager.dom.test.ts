import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeManager, DefaultThemeColors, GrayscaleThemeColors } from '../ThemeManager';
import { Config } from '../../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

describe('ThemeManager DOM Interaction', () => {
    let themeManager: ThemeManager;

    beforeEach(() => {
        // Reset document element styles
        document.documentElement.style.cssText = '';
        themeManager = ThemeManager.getInstance();
    });

    it('applies default theme colors to DOM as CSS variables', () => {
        Config.visual.colorScheme = 'default';
        Config.visual.isDayMode = true;
        
        themeManager.applyToDOM();

        const root = document.documentElement;
        // Note: some JSDOM versions might normalize colors, but setProperty usually preserves the string.
        expect(root.style.getPropertyValue('--player-primary').toUpperCase()).toBe(DefaultThemeColors.playerShip.toUpperCase());
        expect(root.style.getPropertyValue('--enemy-primary').toUpperCase()).toBe(DefaultThemeColors.enemyShip.toUpperCase());
        expect(root.style.getPropertyValue('--bg-base').toUpperCase()).toBe('#ECF0F1');
    });

    it('applies grayscale theme colors when configured', () => {
        Config.visual.colorScheme = 'grayscale';
        Config.visual.isDayMode = true;
        
        themeManager.applyToDOM();

        const root = document.documentElement;
        expect(root.style.getPropertyValue('--player-primary').toUpperCase()).toBe(GrayscaleThemeColors.playerShip.toUpperCase());
        expect(root.style.getPropertyValue('--enemy-primary').toUpperCase()).toBe(GrayscaleThemeColors.enemyShip.toUpperCase());
    });

    it('reacts to THEME_CHANGED event', () => {
        Config.visual.colorScheme = 'custom';
        const testColor = '#FF0000';
        Config.visual.customColors.playerShip = testColor;
        
        // The constructor adds the listener, and it's a singleton.
        eventBus.emit(GameEventType.THEME_CHANGED, undefined as any);

        const root = document.documentElement;
        expect(root.style.getPropertyValue('--player-primary').toUpperCase()).toBe(testColor);
    });

    it('switches between Day and Night modes correctly', () => {
        Config.visual.isDayMode = true;
        themeManager.applyToDOM();
        expect(document.documentElement.style.getPropertyValue('--bg-base').toUpperCase()).toBe('#ECF0F1');

        Config.visual.isDayMode = false;
        themeManager.applyToDOM();
        // ThemeManager.ts line 126 sets #000000 for Night mode bg-base
        expect(document.documentElement.style.getPropertyValue('--bg-base').toUpperCase()).toBe('#000000');
    });
});
