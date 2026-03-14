# Segregation Recommendation

This report identifies files and modules that currently exceed the recommended size limits (~200 lines per file, up to 10 files per folder) and proposes an improved structure to maintain modularity and readability.

## Problematic Files/Modules

The following tree highlights files that are currently too large (exceeding ~200 lines).

```
src/
├── application/
│   ├── game-loop/
│   │   ├── GameLoop.ts (481 lines)
│   │   └── __tests__/
│   │       └── GameLoop.preservation.test.ts (269 lines)
│   └── ai/
│       └── AIEngine.ts (226 lines)
├── presentation/
│   ├── 3d/
│   │   ├── entities/
│   │   │   ├── EntityManager.ts (900 lines)
│   │   │   └── ParticleSystem.ts (206 lines)
│   │   └── interaction/
│   │       └── InteractionManager.ts (250 lines)
│   └── ui/
│       └── hud/
│           └── HUD.ts (316 lines)
└── main.ts (220 lines)
```

### Analysis of Problematic Files

1.  **`src/presentation/3d/entities/EntityManager.ts` (900 lines)**: This is a classic "god class" handling the instantiation, rendering, and animation of boards, water planes, voxel fog, ships, turrets, attack markers/projectiles, and the integration of explosions/particles.
2.  **`src/application/game-loop/GameLoop.ts` (481 lines)**: Manages core state transitions, but also contains specific execution logic for `handleEnemyTurn`, `handleAutoPlayerTurn`, `setTimeout` animation delays, and AI turn coordination. It also handles event bindings for specific UI components (like rotating ships or saving/loading).
3.  **`src/presentation/ui/hud/HUD.ts` (316 lines)**: Manages a large amount of UI state, formatting, and event listeners for the game's heads-up display.
4.  **`src/application/game-loop/__tests__/GameLoop.preservation.test.ts` (269 lines)**: A large test file that likely tests too many distinct scenarios in one place.
5.  **`src/presentation/3d/interaction/InteractionManager.ts` (250 lines)**: Handles raycasting, mouse events, drawing the hover cursor, checking valid ship placements, and drawing the ghost ship during setup.
6.  **`src/application/ai/AIEngine.ts` (226 lines)**: Handles multiple AI difficulties (random, normal, hard), state tracking, and heatmap calculations.
7.  **`src/main.ts` (220 lines)**: Orchestrates initialization, but also defines the main render loop, FPS calculation, and handles several complex global event listeners (like saving the view state or toggling peek mode).
8.  **`src/presentation/3d/entities/ParticleSystem.ts` (206 lines)**: Handles multiple types of particle systems (basic explosions, voxel explosions, smoke, splashes).

## Proposed Improved Structure

The goal is to segregate responsibilities into smaller, focused classes, adhering to the ~200 lines limit per file and ~10 files per folder.

```
src/
├── application/
│   ├── game-loop/
│   │   ├── GameLoop.ts (Core state transitions & pub/sub)
│   │   ├── TurnManager.ts (Handles turn execution logic & delays)
│   │   ├── AutoBattler.ts (Extracts handleAutoPlayerTurn)
│   │   └── EventBindings.ts (Extracts keyboard/save/load event listeners)
│   ├── game-loop-tests/
│   │   ├── GameLoop.state.test.ts
│   │   ├── GameLoop.preservation-save.test.ts
│   │   └── GameLoop.preservation-load.test.ts
│   └── ai/
│       ├── AIEngine.ts (Base interface/context)
│       ├── RandomAIStrategy.ts
│       ├── NormalAIStrategy.ts
│       ├── HardAIStrategy.ts
│       └── HeatmapCalculator.ts
├── presentation/
│   ├── 3d/
│   │   ├── app/
│   │   │   ├── Engine3D.ts
│   │   │   └── RenderLoop.ts (Extracted from main.ts)
│   │   ├── entities/
│   │   │   ├── EntityManager.ts (Orchestrator, holds groups)
│   │   │   ├── BoardRenderer.ts (Handles the frame, water, and grid tiles)
│   │   │   ├── FogRenderer.ts (Handles voxel fog instances and clearing)
│   │   │   └── ShipBuilder.ts (Constructs the voxel ships and turrets)
│   │   ├── projectiles/
│   │   │   ├── ProjectileManager.ts (Handles attack markers & arc animation)
│   │   │   └── ProjectileMesh.ts (Builds the striped voxel missile)
│   │   ├── particles/
│   │   │   ├── ParticleSystem.ts (Base/Manager)
│   │   │   ├── VoxelExplosion.ts
│   │   │   ├── WaterSplash.ts
│   │   │   └── SmokeEmitter.ts
│   │   └── interaction/
│   │       ├── InteractionManager.ts (Core raycaster & mouse tracking)
│   │       ├── HoverCursor.ts (Extracts the glow cursor shader & logic)
│   │       └── GhostShipRenderer.ts (Extracts ghost ship drawing & validation)
│   └── ui/
│       └── hud/
│           ├── HUD.ts (Main wrapper)
│           ├── HUDState.ts (Data management)
│           ├── HUDFormatter.ts (String/time formatting)
│           └── HUDEventListeners.ts (Event binding)
└── main.ts (Lean initialization only)
```

### Key Refactoring Actions

1.  **Deconstruct `EntityManager`**: Split into `BoardRenderer`, `FogRenderer`, `ShipBuilder`, and `ProjectileManager`. This is the highest priority due to its massive size.
2.  **Split `GameLoop`**: Move execution logic (`handleEnemyTurn`, `handleAutoPlayerTurn`) into a `TurnManager` or dedicated strategy classes.
3.  **Modularize AI**: Use the Strategy pattern to separate difficulty levels into their own files.
4.  **Extract UI Logic**: Break `HUD.ts` into a view controller, state manager, and event binder.
5.  **Clean up `main.ts`**: Extract the `animate` loop and FPS counter into a dedicated `RenderLoop` class in the `presentation/3d` layer. Extract event listeners (like `SAVE_GAME` interception) into a configuration or binding module.