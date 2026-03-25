---
inclusion: always
---

# Project Structure

Domain-Driven Design with strict layer separation. Domain and application layers have zero knowledge of Three.js or the DOM.

```
src/
├── domain/                    # Pure game logic, no framework dependencies
│   ├── board/Board.ts         # Grid, cells (CellState enum), attack resolution
│   ├── board/BoardUtils.ts    # Grid index ↔ coordinate helper functions
│   ├── fleet/Ship.ts          # Ship model, orientation, hit segments, occupied coords
│   └── match/Match.ts         # Match rules per mode (Classic/Russian), fleet config, placement validation
│
├── application/               # Orchestration and use cases
│   ├── ai/AIEngine.ts         # AI opponent (Easy=random, Normal=hunt/target, Hard=heatmap)
│   └── game-loop/
│       ├── GameLoop.ts        # State machine orchestration; delegates event/mode logic
│       ├── GameEventManager.ts # Centralized DOM/Game event registration and routing
│       ├── RogueActionHandler.ts # Dedicated Rogue-mode movement and ability logic
│       ├── MatchSetup.ts      # Match initialization, loading, and replay logic
│       └── TurnExecutor.ts    # Turn handling for AI, auto-player, and player interaction
│
├── infrastructure/            # External concerns
│   ├── audio/AudioEngine.ts   # Web Audio API sound engine (singleton, layered synthesis)
│   ├── config/Config.ts       # Runtime config (visual settings, timing, game speed)
│   └── storage/Storage.ts     # Save/load interfaces and localStorage adapter
│
├── presentation/              # All rendering and UI
│   ├── InteractivityGuard.ts  # Centralized input-blocking guard (camera, animations, menus)
│   ├── theme/                 # Dynamic color management
│   │   └── ThemeManager.ts    # Single source-of-truth for DOM CSS variables and 3D WebGL material hexes
│   ├── 3d/
│   │   ├── Engine3D.ts        # Three.js scene, camera, renderer, orbit controls, lighting
│   │   ├── entities/
│   │   │   ├── EntityManager.ts   # Scene orchestration, disposal, and sub-task delegation
│   │   │   ├── WaterShaderManager.ts # Ripple effects and water shader animation timing
│   │   │   ├── VesselVisibilityManager.ts # Ship visibility, sinking, and rogue fog revelation
│   │   │   ├── BoardBuilder.ts    # Procedural generation of board meshes and materials
│   │   │   ├── ShipFactory.ts     # Voxel ship creation and instancing
│   │   │   ├── ProjectileManager.ts # Projectile creation and arc animation
│   │   │   ├── ImpactEffects.ts   # Visual effects for hits, explosions, and breaking/sinking
│   │   │   ├── FogManager.ts      # Enemy board fog-of-war logic (Classic) and dynamic unit-based visibility (Rogue: 5-cell radius around ships).
│   │   │   └── ParticleSystem.ts  # Voxel-based particle effects
│   │   ├── interaction/
│   │   │   └── InteractionManager.ts  # Raycasting, hover highlights, click dispatch
│   │   └── materials/
│   │       └── WaterShader.ts     # Custom vertex/fragment shader for animated voxel water
│   └── ui/
│       ├── UIManager.ts           # Mounts/unmounts UI components based on game state
│       ├── components/
│       │   ├── BaseUIComponent.ts # Abstract base: mount/unmount/show/hide lifecycle
│       │   └── SaveLoadDialog.ts  # Save/load slot picker
│       ├── hud/
│       │   ├── HUD.ts             # Main HUD coordinator (template & lifecycle)
│       │   ├── HUDControls.ts     # Switchboard event bindings and button logic
│       │   ├── HUDStats.ts        # Fleet icons and game statistics display
│       │   └── UnifiedBoardUI.ts  # Mini-map board grids
│       ├── menu/
│       │   ├── MainMenu.ts        # New game / load game entry
│       │   └── GameOver.ts        # Win/loss screen
│       ├── pause/PauseMenu.ts     # Pause overlay with resume/save/quit
│       └── settings/Settings.ts   # Toggle HUD elements, difficulty, day/night
│
├── main.ts                    # Application entry point: initializes Engine3D, GameLoop, UIManager
├── style.css                  # Main CSS barrel (imports thematic styles)
├── styles/                    # Modular CSS files
│   ├── theme.css              # Theme variables (Day/Night) and base HTML/Body styles
│   ├── components.css         # Shared UI components (panels, buttons, selects)
│   ├── main-menu.css          # Main menu layout and card components
│   ├── hud.css                # HUD layout, indicators, and switchboard
│   └── dialogs.css            # Dialogs, overlays, and coordination indicators
```

## Architecture Rules
- `domain/` must never import from `presentation/` or `infrastructure/`
- `application/` must never import from `presentation/`; `Config` and `Storage` are injected via constructor from `main.ts` (no direct `infrastructure/` imports)
- Cross-layer communication uses CustomEvents on `document` (e.g., `SAVE_GAME`, `TOGGLE_PEEK`, `RESTORE_VIEW_STATE`, `INTERACTION_GUARD_STATE`)
- UI components follow a lifecycle pattern: extend `BaseUIComponent`, implement `render()`, use `mount()`/`unmount()`/`show()`/`hide()`
- `main.ts` is the composition root — it wires dependencies and registers event listeners
- One class per file, file named after the primary export
