---
inclusion: always
---

# Project Structure

Domain-Driven Design with strict layer separation. Domain and application layers have zero knowledge of Three.js or the DOM.

## Layer Dependency Rules

- `domain/` → no imports from `application/`, `presentation/`, or `infrastructure/`
- `application/` → may import `domain/`; never imports `presentation/`; `Config` and `Storage` are injected via constructor from `main.ts`
- `presentation/` → may import `domain/`, `application/`, and `infrastructure/`
- `infrastructure/` → may import `domain/`
- Cross-layer communication uses `GameEventBus` (typed pub/sub singleton). Direct `document.dispatchEvent` is prohibited.

## Source Tree

```
src/
├── domain/                        # Pure game logic — no framework deps
│   ├── board/
│   │   ├── Board.ts               # Grid, CellState enum, attack resolution
│   │   ├── BoardUtils.ts          # Grid index ↔ coordinate helpers
│   │   ├── ShipPlacement.ts       # Ship placement logic and validation
│   │   └── WeaponSystem.ts        # Weapon profiles and AoE resolution
│   ├── fleet/
│   │   └── Ship.ts                # Ship model, orientation, hit segments, occupied coords
│   └── match/
│       └── Match.ts               # Match rules per mode, fleet config, placement validation
│
├── application/                   # Orchestration and use cases
│   ├── ai/
│   │   ├── AIEngine.ts            # AI coordinator (Easy/Normal/Hard)
│   │   ├── AIMovement.ts          # Rogue-mode AI ship movement logic
│   │   ├── AITargeting.ts         # AI target selection and heatmap generation
│   │   └── ai.worker.ts           # Web Worker: Hard AI Monte Carlo simulation (off main thread)
│   ├── events/
│   │   └── GameEventBus.ts        # Typed singleton for cross-layer pub/sub
│   └── game-loop/
│       ├── GameLoop.ts            # State machine orchestrator — thin coordinator
│       ├── GameRunner.ts          # Top-level game lifecycle (start, stop, reset)
│       ├── GameEventManager.ts    # Event registration and routing via GameEventBus
│       ├── MatchSetup.ts          # Match initialization, loading, and replay
│       ├── TurnExecutor.ts        # Turn handling for AI, auto-player, and player
│       ├── EnemyTurnHandler.ts    # Enemy turn sequencing and resolution
│       ├── SetupBoardHandler.ts   # Ship placement phase coordination
│       └── RogueActionHandler.ts  # Rogue-mode movement and ability logic
│
├── infrastructure/                # External concerns
│   ├── audio/AudioEngine.ts       # Web Audio API engine (singleton, layered synthesis)
│   ├── config/Config.ts           # Runtime config (visuals, timing, game speed)
│   ├── network/
│   │   ├── INetworkAdapter.ts     # Network adapter interface
│   │   ├── NetworkManager.ts      # Connection lifecycle management
│   │   └── WebSocketAdapter.ts    # WebSocket implementation
│   └── storage/Storage.ts         # Save/load via localStorage (3 slots)
│
├── presentation/                  # All rendering and UI
│   ├── InteractivityGuard.ts      # Static guard: blocks input during transitions/overlays
│   ├── theme/
│   │   └── ThemeManager.ts        # CSS variables + 3D material hex source-of-truth
│   ├── 3d/
│   │   ├── Engine3D.ts            # Three.js scene, camera, renderer, orbit, lighting
│   │   ├── entities/
│   │   │   ├── EntityManager.ts          # Scene orchestrator, disposal, delegation
│   │   │   ├── BoardBuilder.ts           # Procedural board mesh generation
│   │   │   ├── BoardMeshFactory.ts       # Board mesh/material creation
│   │   │   ├── ShipFactory.ts            # Voxel ship creation and instancing
│   │   │   ├── ShipVoxelBuilder.ts       # Low-level voxel geometry for ships
│   │   │   ├── ShipAnimator.ts           # Ship movement and idle animations
│   │   │   ├── TurretInstanceManager.ts  # Instanced turret mesh management
│   │   │   ├── WaterShaderManager.ts     # Water ripple and shader animation
│   │   │   ├── VesselVisibilityManager.ts # Ship visibility, sinking, fog reveal
│   │   │   ├── FogManager.ts             # Fog-of-war (Classic: board-level; Rogue: 5-cell radius)
│   │   │   ├── FogMeshFactory.ts         # Fog cloud mesh generation
│   │   │   ├── FogVisibility.ts          # Fog visibility state calculations
│   │   │   ├── ProjectileManager.ts      # Projectile creation and lifecycle
│   │   │   ├── ProjectileAnimator.ts     # Projectile arc and flight animation
│   │   │   ├── ImpactEffects.ts          # Hit/explosion/breaking visual effects
│   │   │   ├── SinkingEffects.ts         # Underwater wreckage and smoke effects
│   │   │   ├── ParticleSystem.ts         # Thin coordinator for particle effects
│   │   │   ├── ParticleTypes.ts          # Shared particle types and pool config
│   │   │   ├── ParticlePoolManager.ts    # Geometry/material ownership and slot allocation
│   │   │   ├── ParticleSpawner.ts        # Logic for spawning different particle types
│   │   │   ├── EmitterManager.ts         # Particle emitter lifecycle management
│   │   │   └── SonarEffect.ts            # Sonar ping visual effect
│   │   ├── interaction/
│   │   │   ├── InteractionManager.ts     # Coordinator for 3D/UI hover and clicks
│   │   │   ├── RaycastService.ts         # Three.js raycasting abstraction
│   │   │   ├── InputFeedbackHandler.ts   # Hover cursors, ghosts, highlights
│   │   │   ├── ClickHandler.ts           # Click event processing
│   │   │   └── RangeHighlighter.ts       # Weapon range visualization
│   │   ├── materials/
│   │   │   └── WaterShader.ts            # Custom vertex/fragment shader for water
│   │   └── shaders/                      # Raw GLSL shader files
│   │       ├── Water.vert / Water.frag   # Water surface shaders
│   │       └── Fog*.vert                 # Fog volume vertex shaders
│   └── ui/
│       ├── UIManager.ts                  # Mounts/unmounts components by game state
│       ├── components/
│       │   ├── BaseUIComponent.ts        # Abstract base: mount/unmount/show/hide lifecycle
│       │   └── SaveLoadDialog.ts         # Save/load slot picker
│       ├── hud/
│       │   ├── HUD.ts                    # HUD coordinator (template + lifecycle)
│       │   ├── HUDControls.ts            # Switchboard event bindings and buttons
│       │   ├── HUDStats.ts               # Fleet icons and statistics
│       │   └── UnifiedBoardUI.ts         # Mini-map board grids
│       ├── menu/
│       │   ├── MainMenu.ts               # New game / load game entry
│       │   └── GameOver.ts               # Win/loss screen
│       ├── pause/
│       │   └── PauseMenu.ts              # Pause overlay (resume/save/quit)
│       ├── settings/
│       │   ├── Settings.ts               # Modal container and coordinator
│       │   ├── GeneralSettings.ts        # AI, Auto-Battler, Speed
│       │   ├── VideoSettings.ts          # FPS, HUD, Color Themes
│       │   ├── AudioSettings.ts          # Master volume
│       │   └── KeybindingEditor.ts       # Visual keyboard and action binder
│       └── templates/                    # HTML templates for UI components
│           └── TemplateEngine.ts         # Template loading and rendering utility
│
├── main.ts                    # Composition root — wires all dependencies
├── style.css                  # CSS barrel (Tailwind directives + thematic imports)
├── styles/
│   ├── theme.css              # Theme variables (Day/Night), base HTML/body
│   ├── components.css         # Shared UI components (panels, buttons, selects)
│   ├── main-menu.css          # Main menu layout and cards
│   ├── hud.css                # HUD layout, indicators, switchboard
│   └── dialogs.css            # Dialogs, overlays, coordination indicators
└── vite-env.d.ts              # Vite client type declarations
```

## Root Config Files

| File                 | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `vite.config.ts`     | Vite build and dev server configuration                        |
| `tsconfig.json`      | TypeScript compiler options (strict, ES2020, noEmit)           |
| `tailwind.config.js` | Tailwind CSS theme and plugin configuration                    |
| `postcss.config.js`  | PostCSS pipeline (tailwindcss + autoprefixer)                  |
| `index.html`         | SPA entry point — mounts Three.js canvas + `#ui-layer` overlay |
| `package.json`       | Dependencies and npm scripts (`dev`, `build`, `preview`)       |

## Conventions

- One class per file, filename matches the primary export
- `main.ts` is the sole composition root — it wires dependencies and registers `GameEventManager`
- UI components extend `BaseUIComponent` and implement `render()`, using `mount()`/`unmount()`/`show()`/`hide()` lifecycle
- UI is injected into the `#ui-layer` div overlay above the Three.js canvas
- HTML templates live in `presentation/ui/templates/` and are loaded via `TemplateEngine.ts`
- Test files are co-located with source: `*.test.ts` alongside the module, or in `__tests__/` subdirectories
- GLSL shaders are standalone `.vert`/`.frag` files in `presentation/3d/shaders/`

## Delegation Pattern

Large classes are decomposed when they exceed ~300–400 lines or handle multiple responsibilities:

- `GameLoop` → delegates to `GameEventManager`, `RogueActionHandler`, `MatchSetup`, `TurnExecutor`, `EnemyTurnHandler`, `SetupBoardHandler`
- `EntityManager` → delegates to `WaterShaderManager`, `VesselVisibilityManager`, `FogManager`, `EmitterManager`; maintains flat DOD arrays (`activelySinkingShips`, `activelyMovingShips`, `activelyRotatingShips`) iterated with swap-and-pop instead of scene-graph traversal
- `ParticleSystem` → delegates to `ParticlePoolManager` (pooling) and `ParticleSpawner` (spawning)
- `AIEngine` → delegates to `AIMovement`, `AITargeting`; Hard AI offloads Monte Carlo heatmap to `ai.worker.ts` (Web Worker, zero main-thread blocking)
- Primary classes act as thin coordinators; specialized helpers own the logic
- Shared state between coordinator and helpers uses explicit state interfaces or minimal public APIs
