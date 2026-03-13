---
inclusion: always
---

# Project Structure

Domain-Driven Design with strict layer separation. Domain and application layers have zero knowledge of Three.js or the DOM.

```
src/
├── domain/                    # Pure game logic, no framework dependencies
│   ├── board/Board.ts         # Grid, cells (CellState enum), attack resolution
│   ├── fleet/Ship.ts          # Ship model, orientation, hit segments, occupied coords
│   └── match/Match.ts         # Match rules per mode (Classic/Russian), fleet config, placement validation
│
├── application/               # Orchestration and use cases
│   ├── ai/AIEngine.ts         # AI opponent (Easy=random, Normal=hunt/target, Hard=heatmap)
│   └── game-loop/GameLoop.ts  # State machine (MAIN_MENU → SETUP_BOARD → PLAYER_TURN ↔ ENEMY_TURN → GAME_OVER)
│
├── infrastructure/            # External concerns
│   ├── config/Config.ts       # Runtime config (visual settings, timing, game speed)
│   └── storage/Storage.ts     # Save/load interfaces and localStorage adapter
│
├── presentation/              # All rendering and UI
│   ├── 3d/
│   │   ├── Engine3D.ts        # Three.js scene, camera, renderer, orbit controls, lighting
│   │   ├── entities/
│   │   │   ├── EntityManager.ts   # Board meshes, ship placement, attack markers, board flip
│   │   │   └── ParticleSystem.ts  # Explosion and splash voxel particles
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
│       │   ├── HUD.ts             # Turn indicator, fleet status, game stats, geek stats
│       │   └── UnifiedBoardUI.ts  # Mini-map board grids
│       ├── menu/
│       │   ├── MainMenu.ts        # New game / load game entry
│       │   └── GameOver.ts        # Win/loss screen
│       ├── pause/PauseMenu.ts     # Pause overlay with resume/save/quit
│       └── settings/Settings.ts   # Toggle HUD elements, difficulty, day/night
│
├── main.ts                    # App bootstrap: wires all layers, starts render loop
└── style.css                  # Global styles, theme variables, voxel UI classes
```

## Architecture Rules
- `domain/` and `application/` must never import from `presentation/` or `infrastructure/`
- Cross-layer communication uses CustomEvents on `document` (e.g., `SAVE_GAME`, `TOGGLE_PEEK`, `RESTORE_VIEW_STATE`)
- UI components follow a lifecycle pattern: extend `BaseUIComponent`, implement `render()`, use `mount()`/`unmount()`/`show()`/`hide()`
- `main.ts` is the composition root — it wires dependencies and registers event listeners
- One class per file, file named after the primary export
