# Battleships - Technical Breakdown

This document outlines the high-level technical implementation strategy for the browser-based, voxel-style 3D Battleships game, based on the requirements described in `game-concept.md`.

## 1. Technology Stack

*   **Core Language:** JavaScript (ES6+) / TypeScript (recommended for maintainability and complex game logic scaling).
*   **3D Rendering Engine:** **Three.js**. It is lightweight, highly performant for browser games, and excellently supports custom shaders (for water) and `InstancedMesh` (essential for efficient voxel rendering).
*   **UI/Menu Framework:** **Vanilla JS / HTML / CSS** (with CSS variables for theming) or a lightweight framework like **Preact** or **Vue** to handle the Main Menu, HUD, and Settings screens without bloating the bundle size.
*   **Asset Pipeline:** MagicaVoxel for creating voxel models (exported as `.vox` or `.gltf` / `.glb` for easy loading in Three.js).
*   **Storage:** **localStorage** or **IndexedDB** for saving game states across the 3 supported save slots.

## 2. Architecture Overview

To support current requirements and ensure flexibility for future features ("Rogue" mode, movable ships, weapon variations), the system will follow a modular Object-Oriented paradigm (or an Entity-Component-System like `bitecs` if complexity scales up).

### 2.1. Core Modules
1.  **Game Controller (State Machine):** Manages high-level states: `MAIN_MENU`, `SETUP_BOARD`, `PLAYER_TURN`, `ENEMY_TURN`, `GAME_OVER`.
2.  **Rule Engine:** A flexible configuration module that defines mode-specific parameters.
    *   *Classic Mode:* Standard US ship fleet, specific placement rules.
    *   *Russian Mode:* Russian ship fleet (1x 4-deck, 2x 3-deck, etc.), strict non-touching adjacency rules.
3.  **Entity Manager:** Treats ships, projectiles, and grid cells as individual entities rather than static values in a 2D array. This natively supports future planned features like *ship movement*.
4.  **AI Engine:** Uses the Strategy Pattern to swap between difficulties:
    *   *Easy:* Random targeting without memory.
    *   *Normal:* Random hunting; switches to targeted adjacency search upon a hit.
    *   *Hard:* Probabilistic heatmap generation (Monte Carlo approach) to find ships based on the remaining fleet geometry.
5.  **Rendering Engine (View):** Listens to Game Controller state changes to update the 3D scene (camera transitions, firing animations, particle spawning).

## 3. Rendering & Graphics (The "Minecraft Feel")

*   **Voxel Water:** 
    *   Implemented via a custom vertex/fragment shader applied to a high-poly plane or a grid of instanced blocks. 
    *   The shader will use sine waves / noise functions to simulate animated undulating water. Uniforms passed from JS will dictate local disturbances (ripples from ship wakes and projectile splashes).
*   **Voxel Ships & Destruction Environment:**
    *   Ships will be loaded as composite `.gltf` meshes or built from `InstancedMesh` blocks.
    *   *Damage:* Sub-meshes or specific voxels can be hidden/removed dynamically when a ship segment is hit. 
    *   *Particles systems:* A lightweight custom particle system (or Three.js `Points`) to simulate flying colored voxels for explosions. 
    *   *Smoke:* Transparent animated sprites or floating dark voxels spawning from damaged/sunken ship coordinates (grey for hits, black for wreckage).
*   **Interaction Highlights:**
    *   Raycasting via Three.js to map 2D mouse coordinates to the 3D tactical grid.
    *   A glowing translucent "cursor" box or grid overlay mapped precisely to the hovered/selected area.
*   **Animations:** 
    *   Camera tweaks and translation lerping for ship firing animations to pick a random available player vessel to act as the "attacker".

## 4. Extensibility for "Rogue Mode"

To ensure the codebase doesn’t need a complete rewrite when Rogue mode (moving ships, varied weapons) is added:
*   **Decoupled Grid:** The tactical grid is just a mathematical coordinate system. Ships possess an `(x, y)` position and an `orientation`. Moving a ship merely changes its coordinates; the GameLogic then re-evaluates occupancy.
*   **Weapon Profiles:** Attacks should not just be `fire(x, y)`. Instead, use `executeAttack(weaponOrigin, targetVector, weaponType)`. The default `weaponType` is a 1x1 tile strike, but this leaves the door open for AoE (Area of Effect) weapons or directional torpedoes later.

## 5. System Requirements & Performance Targets
*   **Assets:** Strict low-poly/voxel limit per ship to ensure rapid load times.
*   **Draw Calls:** Extensive use of geometry merging or `InstancedMesh` for static objects to keep draw calls to an absolute minimum (target < 100).
*   **Simulation Loop:** Use `requestAnimationFrame` for rendering, but decouple game logic step rates (tick rate) if needed to prevent calculation spikes (like Hard AI heatmaps) from dropping frames.

## 6. Directory Structure (Domain-Driven Design)

To ensure long-term maintainability (specifically for adding future modes like "Rogue" and "Russian"), the project should follow a Domain-Driven Design (DDD) architecture. This naturally separates out the presentation layer (3D rendering and UI) from the core game rules and logic. 

Here is the proposed skeleton structure:

```text
src/
├── domain/                  # Core business logic and pure game entities (framework-agnostic)
│   ├── fleet/               # Ship models, damage state, and layout geometry
│   ├── board/               # Grid coordinates, cells, attacks (hits/misses), and spatial constraints
│   └── match/               # Rule engines, turn state machine, scoring, and win/loss conditions
│
├── application/             # Use cases and system orchestration
│   ├── ai/                  # AI opponent strategy patterns (Easy, Normal, Hard)
│   └── game-loop/           # State transitions, turn orchestrator, and event broadcasting
│
├── infrastructure/          # External side-effects and data persistence
│   ├── storage/             # localStorage/IndexedDB database adapters for the 3 save slots
│   └── config/              # Game configuration data (Classic rules vs. Russian rules)
│
└── presentation/            # UI, interaction, and 3D rendering (Three.js & DOM)
    ├── 3d/                  # The 3D Engine layer
    │   ├── materials/       # Custom shaders (animated voxel water, damage effects)
    │   ├── entities/        # 3D InstancedMeshes (ships, voxel explosions, smoke particles)
    │   └── interaction/     # Raycasting, hover state glowing boundaries, input conversion
    ├── ui/                  # 2D overlays and menus (HTML/CSS or lightweight framework)
    │   ├── menu/            # Main menu, save slot selection
    │   ├── hud/             # Active turn indicators, remaining fleet status
    │   └── settings/        # Options menu (difficulty toggles, HUD display settings)
    └── assets/              # Static files loaded at runtime
        ├── models/          # .vox / .gltf files exported from MagicaVoxel
        └── styles/          # Core CSS variables and themes
```

### Why this structure matches our goals:
1. **Decoupled Engine:** The `domain` and `application` layers have zero knowledge of Three.js or the DOM. They run purely in JavaScript, making it trivial to simulate thousands of invisible games instantly for training the "Hard" Monte Carlo AI algorithm.
2. **Flexible Modes:** By isolating `config` and `match` domains, switching from "Classic" to "Russian" mode just injects a different ruleset without touching the rendering or core board logic.
3. **Extendable Assets:** As new weapons or modes are added in the "Rogue" mode, we'll only need to inject new definitions into the `domain` without risking breakage in the presentation layer.
