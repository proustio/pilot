import * as THREE from 'three';
import { Config } from '../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../application/events/GameEventBus';

export interface ThemeColors {
    playerShip: string;
    enemyShip: string;
    waterPrimary: string;
    waterSecondary: string;
    boardLines: string;
    industrialBase: string;
    rivet: string;
    screw: string;
}

export const DefaultThemeColors: ThemeColors = {
    playerShip: '#50C878', // True Emerald
    enemyShip: '#8D2B00',  // Oxide Rust
    waterPrimary: '#00563F', // Evening Sea
    waterSecondary: '#3D5E42', // Tom Thumb
    boardLines: '#2C3F50', // Deep Charcoal
    industrialBase: '#050515',
    rivet: '#444455',
    screw: '#444444'
};

export const GrayscaleThemeColors: ThemeColors = {
    playerShip: '#E0E0E0', 
    enemyShip: '#404040',  
    waterPrimary: '#808080', 
    waterSecondary: '#606060', 
    boardLines: '#202020',
    industrialBase: '#303030',
    rivet: '#606060',
    screw: '#505050'
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

    public getIndustrialBaseColor(): THREE.Color {
        return this.getColor(Config.visual.isDayMode ? '#C0C0C0' : this.getActiveColors().industrialBase);
    }

    public getRivetColor(): THREE.Color {
        return this.getColor(this.getActiveColors().rivet);
    }

    public getScrewColor(): THREE.Color {
        return this.getColor(this.getActiveColors().screw);
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
        root.style.setProperty('--bg-base', Config.visual.isDayMode ? '#ECF0F1' : '#000000'); // Pale Zircon or CRT Void
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

    public getIndustrialTexture(): THREE.Texture {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')! ;

        const baseColor = this.getIndustrialBaseColor().getStyle();
        const gridColor = this.getBoardLinesColor().getStyle();

        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = gridColor;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 1;
        for (let i = 0; i < size; i += 16) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i); ctx.lineTo(size, i);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        for (let i = 0; i < 500; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const s = Math.random() * 1.5;
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)';
            ctx.fillRect(x, y, s, s);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 1);
        return tex;
    }
}
