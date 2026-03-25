import * as THREE from 'three';
import { Config } from '../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../application/events/GameEventBus';

export interface ThemeColors {
    playerShip: string;
    enemyShip: string;
    waterPrimary: string;
    waterSecondary: string;
    boardLines: string;
}

export const DefaultThemeColors: ThemeColors = {
    playerShip: '#50C878', // True Emerald
    enemyShip: '#8D2B00',  // Oxide Rust
    waterPrimary: '#00563F', // Evening Sea
    waterSecondary: '#3D5E42', // Tom Thumb
    boardLines: '#2C3F50' // Deep Charcoal
};

export const GrayscaleThemeColors: ThemeColors = {
    playerShip: '#E0E0E0', 
    enemyShip: '#404040',  
    waterPrimary: '#808080', 
    waterSecondary: '#606060', 
    boardLines: '#202020' 
};

export class ThemeManager {
    private static instance: ThemeManager;
    private cache: Map<string, THREE.Color> = new Map();

    private constructor() {
        eventBus.on(GameEventType.THEME_CHANGED, () => {
             this.applyToDOM();
        });
    }

    public static getInstance(): ThemeManager {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }

    private getActiveColors(): ThemeColors {
        if (Config.visual.colorScheme === 'custom') {
            return Config.visual.customColors;
        } else if (Config.visual.colorScheme === 'grayscale') {
            return GrayscaleThemeColors;
        }
        return DefaultThemeColors;
    }

    private getColor(hex: string): THREE.Color {
        // Cache THREE.Color instances to avoid reallocation if possible, 
        // though re-caching on theme change is also fine since we return clones or immutable 
        if (!this.cache.has(hex)) {
            this.cache.set(hex, new THREE.Color(hex));
        }
        return this.cache.get(hex)!;
    }

    public getPlayerShipColor(): THREE.Color {
        return this.getColor(this.getActiveColors().playerShip);
    }

    public getEnemyShipColor(): THREE.Color {
        return this.getColor(this.getActiveColors().enemyShip);
    }

    public getWaterColors(): { primary: THREE.Color, secondary: THREE.Color } {
        const colors = this.getActiveColors();
        return {
            primary: this.getColor(colors.waterPrimary),
            secondary: this.getColor(colors.waterSecondary)
        };
    }

    public getBoardLinesColor(): THREE.Color {
        return this.getColor(this.getActiveColors().boardLines);
    }

    public getBackgroundColor(): THREE.Color {
        // Day: Pale Zircon #ECF0F1, Night: CRT Void #050608
        return this.getColor(Config.visual.isDayMode ? '#ECF0F1' : '#050608');
    }

    public getFogColor(): THREE.Color {
        // Match background for seamless fog
        return this.getBackgroundColor();
    }

    public getAmbientLightColor(): THREE.Color {
        return this.getColor(Config.visual.isDayMode ? '#FFFFFF' : '#404040');
    }

    public getDirectionalLightColor(): THREE.Color {
        return this.getColor(Config.visual.isDayMode ? '#FDFBD3' : '#8A9AAB'); // Warm sun vs Cool moon
    }

    public applyToDOM(): void {
        const root = document.documentElement;
        const colors = this.getActiveColors();

        // Tactical colors
        root.style.setProperty('--player-primary', colors.playerShip);
        root.style.setProperty('--enemy-primary', colors.enemyShip);
        root.style.setProperty('--water-primary', colors.waterPrimary);
        root.style.setProperty('--water-secondary', colors.waterSecondary);
        root.style.setProperty('--board-lines', colors.boardLines);

        // Environmental colors & Contextual panel colors
        if (Config.visual.isDayMode) {
            root.style.setProperty('--bg-base', '#ECF0F1'); // Pale Zircon
            root.style.setProperty('--text-base', '#0B1026'); // Midnight Navy
            root.style.setProperty('--panel-bg', 'rgba(255, 255, 255, 0.85)');
            root.style.setProperty('--panel-border', colors.playerShip);
            root.style.setProperty('--panel-text', '#0B1026');
            
            // Buttons
            root.style.setProperty('--btn-bg', 'rgba(255, 255, 255, 0.9)');
            root.style.setProperty('--btn-bg-hover', 'rgba(240, 248, 255, 1.0)');
            root.style.setProperty('--btn-border', '#0B1026');
            root.style.setProperty('--btn-text', '#0B1026');
        } else {
            root.style.setProperty('--bg-base', '#000000'); // Or #050608 (CRT Void)
            root.style.setProperty('--text-base', '#FFFFFF');
            root.style.setProperty('--panel-bg', 'rgba(0, 0, 10, 0.7)');
            root.style.setProperty('--panel-border', colors.playerShip);
            root.style.setProperty('--panel-text', '#FFFFFF');

            // Buttons
            root.style.setProperty('--btn-bg', 'rgba(0, 0, 30, 0.8)');
            root.style.setProperty('--btn-bg-hover', 'rgba(0, 0, 80, 0.9)');
            root.style.setProperty('--btn-border', colors.playerShip);
            root.style.setProperty('--btn-text', colors.playerShip);
        }
    }
}
