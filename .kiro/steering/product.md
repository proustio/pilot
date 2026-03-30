---
inclusion: always
---

# Product: 3D Voxel Battleships

Browser-based Battleships game with a Minecraft-style 3D voxel aesthetic, built with Three.js and TypeScript. Designed for lightweight performance and a premium, responsive feel.

## Game Modes

| Mode | Grid | Ships | Key Features | Status |
|------|------|-------|--------------|--------|
| Classic | 10x10 | Standard fleet | American rules, dual boards | Stable |
| Russian | 10x10 | Russian fleet | Strict non-touching adjacency | Stable |
| Rogue | 20x20 | Dynamic fleet | Movable ships, special weapons | In development |

## Core Gameplay

- Single-player vs AI (Easy / Normal / Hard difficulty)
- Turn-based: place ships → take turns firing → destroy all enemy ships to win
- Storage: 3 save/load slots via localStorage
- Day/night theme toggle with custom Tactical Color Schemes

## Board Functionality

### Classic / Russian Modes

- **Grid Size**: 10x10 cells.
- **Ships**: Static placement; fixed position for the duration of the match.
- **Turns**: Single shot per turn.
- **Persistence**: Hit, miss, and kill markers are permanent.
- **Dual Boards**: Two active sides (Friendly and Enemy). Board flips to reveal player's board during enemy turns and shows enemy side (with fog) for player shooting.
- **Effects**: Animations and visual effects applied to the currently active side only.
- **Camera**: Transitions between boards per turn phase.

### Rogue Mode

- **Grid Size**: 20x20 cells.
- **Dynamic Fleet**: Each ship can move, attack, or skip on each turn.
- **Dead Ships**: Remain on board permanently, blocking cells they occupied at time of death.
- **Attacks**: Normal attacks or special weapon systems (AoE, etc.).
- **Persistence**: Miss markers (hits on water) are transient (vanish after opponent's turn); hit markers on ships and kill markers are permanent.
- **Shared Board**: Single 20x20 coordinate space. Ships start in opposing 10x10 corners.
- **Fog of War**: 5-cell radius around each ship (revealed by ship or weapon systems).
- **Static Orientation**: Board never flips between turns.
- **Unified Environment**: All items, animations, and effects on single shared board.

## Key Visual Features

- **Voxel Water**: Animated shaders (sine wave + noise) with ripple effects.
- **Fog of War**: Volumetric voxel-based clouds at water level obscuring enemy fleet.
- **Ship Destruction**: Voxel particles, persistent hit flames, multi-layered explosion audio.
- **Sunken Ships**: Underwater wreckage + lingering black smoke markers.
- **Attacker Selection**: Random player vessel animates as "firing" during attacks.
- **Interaction**: Raycasting-based grid selection with glowing translucent 3D hover highlights.
- **Camera**: Transitions between boards per turn phase (Classic/Russian only).

## Distribution & Platforms

| Platform | Delivery Method | Key Requirements |
|----------|-----------------|------------------|
| Web (PWA) | Browser-based | Offline-capable via Service Workers |
| Desktop (Steam/Itch.io) | Electron wrapper | Consistent Three.js rendering, Steamworks API access |
| Mobile (iOS/Android) | Capacitor | Native SDK integration, UI hardening (disable scroll, selection, magnifying glass) |

**Architecture Rule**: Single `dist/` output deployed everywhere. Core game logic and rendering must remain decoupled from wrapper-specific code (Electron/Capacitor).

## Design Priorities

1. **Maintainability through Modularity**: Proactively decompose large classes (>300-400 lines). Use utility-first CSS (Tailwind). Prefer built-in Tailwind classes over custom CSS.
2. **Lightweight Performance**: Fast-loading voxel assets, efficient instanced rendering. Keep draw calls < 100.
3. **Architectural Extensibility**: Decouple domain logic from presentation to easily accommodate new game modes.
4. **Platform Independence**: Single `dist/` output for all platforms. Platform-specific code lives in wrapper shells only.

## Architecture Patterns

### Domain-Driven Design Layers

```
src/
├── domain/           # Pure game logic, no framework dependencies
├── application/      # Orchestration and use cases (delegates to domain)
├── infrastructure/   # External concerns (storage, network, audio)
└── presentation/     # Rendering and UI (depends on all above)
```

**Layer Rules**:
- `domain/` never imports from `presentation/` or `infrastructure/`
- `application/` never imports from `presentation/` (except `Config` and `Storage` injected via constructor)
- Cross-layer communication uses `GameEventBus` (typed pub/sub)
- `main.ts` is the composition root — wires dependencies

### Event-Driven Architecture

- **Centralized Communication**: `GameEventBus` singleton for cross-layer communication
- **Events Include**: `SAVE_GAME`, `TOGGLE_PEEK`, `RESTORE_VIEW_STATE`, `THEME_CHANGED`, etc.

### Visual Consistency & Theming

- **Single Source of Truth**: `ThemeManager.ts` for all colors
- **Dynamic Updates**: All presentation layers (DOM and Three.js) query `ThemeManager` and react to `THEME_CHANGED` event
- **No Hardcoding**: Never hardcode colors in meshes or shaders

### UI Component Pattern

- **Base Class**: All UI components extend `BaseUIComponent`
- **Lifecycle**: `render()`, `mount()`, `unmount()`, `show()`, `hide()`
- **Injection Point**: UI injected into `#ui-layer` div overlay above Three.js canvas

### Performance Targets

- **Draw Calls**: < 100 (use `InstancedMesh` for repeated geometry)
- **Frame Rate**: Use `requestAnimationFrame` for rendering
- **Heavy Simulation**: Decouple to prevent frame drops (e.g., Hard AI Monte Carlo)
- **Interactivity**: `InteractivityGuard` blocks input during camera transitions, animations, and menus

### AI Strategy

- **Easy**: Random moves
- **Normal**: Hunt/target pattern
- **Hard**: Monte Carlo approach generating probabilistic heatmaps based on remaining fleet geometry

### Weapon Profiles

- **Default**: 1x1 attack
- **Rogue Mode**: Support AoE strikes and special weapons via `weaponType` profile
- **Hit Markers**: In Rogue mode, miss markers (water hits) are transient (vanish after opponent's turn); hit markers on ships are permanent in all modes
- **Kill Markers**: Always permanent

## Common Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Type-check with tsc, then bundle with Vite
npm run preview  # Preview production build locally
```

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict mode, ES2020 target) |
| Build | Vite 7.x (dev server, bundler, HMR) |
| 3D Rendering | Three.js 0.183.x |
| Styling | Tailwind CSS 3.4.x |
| Audio | Web Audio API (procedural synthesis) |
| Storage | localStorage (3 slots max) |
| 3D Modeling | MagicaVoxel (export format) |
