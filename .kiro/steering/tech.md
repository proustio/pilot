---
inclusion: always
---

# Tech Stack

## Language & Runtime
- TypeScript (strict mode, ES2020 target)
- ES Modules (`"type": "module"` in package.json)

## Build System
- Vite 7.x (dev server, bundler, HMR)
- `tsc` for type checking (noEmit — Vite handles transpilation)

## Dependencies
- three.js 0.183.x — 3D rendering, shaders, instanced meshes, raycasting
- @types/three — type definitions
- Web Audio API — Layered procedural sound synthesis via `AudioEngine` (no audio file assets)
- MagicaVoxel — Primary tool for creating and exporting voxel 3D models.

## UI
- Vanilla HTML/CSS/TypeScript — no UI framework
- CSS custom properties dynamically hydrated by `ThemeManager` for real-time Day/Night and custom Tactical Color Schemes
- All UI components extend `BaseUIComponent` abstract class
- UI is injected into `#ui-layer` div overlay above the Three.js canvas

## Storage
- localStorage for save/load (3 slots max)

## Common Commands
```bash
npm run dev      # Start Vite dev server
npm run build    # Type-check with tsc, then bundle with Vite
npm run preview  # Preview production build locally
```

## Code Organization
- **Modular Decomposition**: Large, complex classes (e.g., `GameLoop`, `EntityManager`, `HUD`) are intentionally decomposed once they exceed ~300-400 lines or handle multiple distinct responsibilities. `GameLoop` delegates to `GameEventManager`/`RogueActionHandler`, and `EntityManager` delegates to `WaterShaderManager`/`VesselVisibilityManager`.
- **Delegation Pattern**: Primary classes (like `GameLoop`) act as thin coordinators/orchestrators, delegating specific logic to specialized helper classes (e.g., `MatchSetup`, `TurnExecutor`).
- **Shared State**: Communication between coordinators and helpers is managed via explicit state interfaces or minimal public APIs rather than direct field access.
- **Static Builders**: Heavy procedural generation (e.g., 3D board construction) is extracted into static `build()` methods in dedicated classes like `BoardBuilder`.
- **CSS Modularity**: Global styles are decomposed into thematic modules (`theme.css`, `components.css`, `hud.css`, etc.) and bundled via build-time `@import` statements in `style.css`.
- **Event-Driven Architecture**: Cross-layer communication is centralized in `src/application/events/GameEventBus.ts`. This singleton provides a typed pub/sub interface for game state changes, UI triggers, and configuration updates, replacing legacy `document`-level event listeners.
- **Visual Consistency & Theming**: All presentation layers (DOM and Three.js) MUST query explicit hexes and variables from `ThemeManager.ts`. Avoid hardcoding colors directly in meshes or shaders; instead, dynamically react to the `THEME_CHANGED` event on the `GameEventBus` to support real-time user-defined color customization.
- **InteractivityGuard**: A centralized static class (`presentation/InteractivityGuard.ts`) blocks all user input during camera transitions, turn animations, and menu overlays. Toggles the `.interactivity-blocked` CSS class on `<body>` and interacts with the `GameEventBus` where necessary.
- **Performance Targets**: Keep draw calls < 100 by using `InstancedMesh` for repeated voxel geometry (ships, water blocks, particles). Standard boards are 10x10; Rogue mode uses a larger 20x20 shared grid, requiring careful management of instanced meshes and dynamic fog-of-war updates. Use `requestAnimationFrame` for rendering, but decouple heavy simulations (like Hard AI) to prevent frame drops.
- **AI Strategy**: The "Hard" AI difficulty uses a Monte Carlo approach to generate probabilistic heatmaps based on remaining fleet geometry.
- **DDD Rationale**: Decoupling `domain/` and `application/` from Three.js/DOM allows for "headless" logic simulation (useful for AI training or unit testing).
- **Weapon Profiles**: All attacks use a `weaponType` profile (default 1x1) to support Rogue mode variations like AoE strikes or special weapons. In Rogue mode, hit/miss markers are transient and vanish after the opponent's subsequent turn, while kill markers are permanent.
- **Shared Board Architecture**: Unlike the dual-board setup in Classic mode, Rogue mode utilizes a single 20x20 shared coordinate space. Ships start in opposing 10x10 corners, and the viewport/orientation remains static throughout the match. Cells occupied by destroyed ships remain blocked and impassable for the remainder of the game.
- **Multi-Platform Architecture**: The project uses a "Best of Breed" split for distribution.
  - **Desktop**: Electron-based shell wrapping the Vite `dist/` output.
  - **Mobile**: Capacitor-based container for native iOS/Android deployment.
  - **CSS Hardening**: Native-feel UI requirements (disabling scrolling, user-selection, and magnifying glass) are handled via targeted CSS media queries or platform-specific classes.
  - **Platform Abstraction**: Use a centralized `PlatformService` (planned) to abstract hardware-specific logic like file persistence or native notifications.

