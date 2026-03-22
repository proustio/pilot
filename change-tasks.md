# Implementation Tasks: Centralized Theme & Custom Colors

## Phase 1: Global Configuration & Logic
- [x] **Update Configuration Storage (`Config.ts`)**
  - Add `visual.colorScheme` type (`'default' | 'grayscale' | 'custom'`).
  - Add `visual.customColors` object mapping specific hex codes for customizable vectors (e.g., `playerShip`, `enemyShip`, `waterPrimary`, `waterSecondary`, `boardLines`).
  - Validate that `Config.saveConfig()` properly writes to global `localStorage` so themes transcend save slots and browser refreshes.

- [x] **Create `src/presentation/theme/ThemeManager.ts`**
  - Define static preset palettes (Default Emerald/Orange, Grayscale).
  - Implement a color resolver: if `colorScheme` is `'custom'`, pull from `Config.visual.customColors`; otherwise, pull from the presets.
  - Expose getters (`getPlayerColor()`, `getEnemyColor()`, `getWaterColors()`) and DOM injector (`applyToDOM()`).
  - Listen for `THEME_CHANGED` custom events to execute recalculations.

## Phase 2: UI and Settings Integration
- [x] **Settings Menu Interface (`Settings.ts`)**
  - Construct a "Theme" dropdown (`Default`, `Grayscale`, `Custom`).
  - Render interactive `<input type="color">` pickers for the main vectors (Player Fleet, Enemy Fleet, Water, Board).
  - Add event listeners to the color pickers to mutate `Config.visual.customColors`, swap the dropdown to `Custom`, call `Config.saveConfig()`, and fire `THEME_CHANGED` instantly.

- [x] **CSS Modernization (`theme.css`)**
  - Remove monolithic `.day-mode` static nests.
  - Re-assign HUD borders, geek stats blocks, and mini-boards to `var(--player-primary)` and `var(--enemy-primary)` variables actively hydrated by `ThemeManager`.

## Phase 3: Three.js Immediate Reaction Architecture
- [x] **Global Scene Nodes (`Engine3D.ts`)**
  - Listen to `THEME_CHANGED` to instantly update background color, fog color, and lighting arrays explicitly via `ThemeManager`.

- [x] **Mesh & Particle Materials (`ShipFactory.ts`, `ParticleSystem.ts`, `BoardBuilder.ts`)**
  - Update material definitions during initial map generation to pull faction colors from `ThemeManager`.
  - Add update hooks that iterate through active `InstancedMesh` shared materials when `THEME_CHANGED` fires. Overwrite `material.color.setHex()` dynamically so the user sees changes immediately during Settings adjustments.

- [x] **Shader Uniforms (`WaterShader.ts`)**
  - Subscript `uColor1.value` and `uColor2.value` directly to `ThemeManager` variables.
  - Create an update interface triggered by `THEME_CHANGED`.

## Phase 4: Verification 
- [x] **Real-Time Customization Test**
  - Drag a color picker in Settings and verify the 3D ships, water, particles, and HTML HUD swap instantly without frame drops.
- [x] **Global Persistence Verify**
  - Set a bizarre custom theme, refresh the browser, click "New Game" (ignoring old save slots), and verify the bizarre theme loads perfectly via `Config`.
