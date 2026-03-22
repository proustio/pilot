# Change Request: Centralized Theme & Custom Colors

## 1. Objective
Refactor the application's visual architecture to utilize a single, centralized `ThemeManager`. This manager will preserve the existing Light/Dark (Day/Night) base environments while introducing a comprehensive Tactical Color Scheme system. 
By default, the game will ship with two themes:
1. **Default**: Utilizes the specific colors from `docs/color-palette.html` (Player = Emerald Tactical Sequence, Enemy = Dirty Orange Kinetic Sequence).
2. **Grayscale (High Contrast)**: A monochrome accessibility mode.

Additionally, players can select a **Custom** theme, allowing them to explicitly change any color they want (Player fleet, Enemy fleet, water, etc.) via in-game settings. Color choices will be persisted globally per-user, rather than tied to specific game save slots.

## 2. Core Architectural Changes

### 2.1 Centralized `ThemeManager` (`src/presentation/theme/ThemeManager.ts`)
- **Single Source of Truth**: Evaluates and distributes all active palette colors to both the DOM and Three.js scenes.
- **Role separation**: 
  - **Base Context**: Light vs. Dark (`isDayMode`).
  - **Tactical Scheme Context**: Dictated by `colorScheme` (`'default'`, `'grayscale'`, or `'custom'`).
- **Custom Color Evaluation**: When `'custom'` is active, `ThemeManager` pulls explicit hex values directly from the user's saved global config rather than internal presets.
- **DOM Injection**: Dynamically constructs and injects CSS Custom Properties (`--player-primary`, `--enemy-primary`, `--bg-base`, etc.) into `document.documentElement`.
- **3D Color Definitions**: Exposes explicit `THREE.Color` instances for 3D voxel and shader generation.

### 2.2 Global App Configuration (`src/infrastructure/config/Config.ts`)
- `visual.colorScheme`: Tracks the active theme (`'default' | 'grayscale' | 'custom'`).
- `visual.customColors`: A dictionary tracking the player's unique color overrides (e.g., `{ playerShip: '#xxxxxx', enemyShip: '#xxxxxx', water1: '#xxxxxx', ... }`).
- **Global Persistence**: `Config.saveConfig()` routes to `localStorage` ('battleships_config'). This ensures visual preferences persist universally across browser refreshes, independent of the active save game slot (save slots manage match state, not user app preferences).

## 3. Presentation Layer: UI (CSS & Settings)
- **Settings UI (`src/presentation/ui/settings/Settings.ts`)**:
  - Expose the Theme dropdown (`Default`, `Grayscale`, `Custom`).
  - Render an array of `<input type="color">` pickers. Modifying these automatically sets the dropdown to `Custom` and updates `Config.visual.customColors`.
  - Trigger a global `THEME_CHANGED` event on any adjustment.
- **CSS Variable Integration (`theme.css`)**:
  - Remove hardcoded colors and `.day-mode` class nests. Replace with `var(--xx)` roots pumped by `ThemeManager`.

## 4. Presentation Layer: Three.js 3D View
- **Global Real-Time Updates**:
  - `Engine3D.ts` updates `scene.background` and light colors on `THEME_CHANGED`.
  - `WaterShader.ts` updates its specific uniforms.
  - `ParticleSystem.ts` and `ShipFactory.ts` update their internal shared `InstancedMesh` `.color` buffers, instantly reflecting any `<input type="color">` adjustment without refreshing the browser or re-triggering heavy geometry calculations.

## 5. Review Notes against `.kiro/steering`:
- **Maintainability & DDD**: Completely isolates logic. `Config` manages state, `Settings` dispatches intent, `ThemeManager` calculates values, and Presentation layers blindly consume the values.
- **Performance**: Instantaneous feedback when dragging color pickers is achieved by mutating material colors in-place, keeping draw call penalties at zero.
