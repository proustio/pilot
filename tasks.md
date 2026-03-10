# Battleships Implementation Tasks

This document contains a step-by-step plan to implement the 3D voxel-based Battleships game described in `game-concept.md` and `tech-breakdown.md`.

## Phase 1: Project Setup and Architecture Skeleton
- [x] Initialize project package and dependencies (Three.js, Vite or preferred bundler).
- [x] Set up basic HTML/CSS scaffolding.
- [x] Create domain-driven directory structure (`src/domain`, `src/application`, `src/infrastructure`, `src/presentation`).
- [x] Create placeholder/stub files for all major modules outlined in the tech breakdown.

## Phase 2: Basic 3D Presentation & Interaction
- [x] **Three.js Core** (`src/presentation/3d/`)
    - [x] Initialize Three.js scene, camera, and WebGL renderer.
    - [x] Configure global lighting (ambient, directional shadows).
- [x] **Assets & Entities** (`src/presentation/3d/entities/`)
    - [x] Import `.vox` / `.gltf` placeholder models for ships.
    - [x] Render a generic blocky target grid / voxel water plane.
- [x] **Interaction & Mechanics** (`src/presentation/3d/interaction/`)
    - [x] Add Raycaster logic to translate 2D mouse coordinates to the 3D tactical grid.
    - [x] Display a visual highlight cursor over the hovered 3D grid cell.

## Phase 3: Domain Layer (Core Game Logic)
- [x] **Fleet Module** (`src/domain/fleet/`)
    - [x] Define Ship classes (size, orientation, health/damage state).
    - [x] Implement segment hit logic.
    - [x] Implement "isSank" evaluation logic.
- [x] **Board Module** (`src/domain/board/`)
    - [x] Create the grid coordinate system.
    - [x] Implement occupancy checks (is cell free?).
    - [x] Implement ship placement logic (boundary limits, overlapping constraints).
    - [x] Implement attack resolution (track hits, misses on coordinates).
- [x] **Match Module** (`src/domain/match/`)
    - [x] Implement Classic mode ruleset (US fleet layout, standard placement).
    - [x] Implement Russian mode ruleset (Russian fleet layout, non-touching adjacency).
    - [x] Implement win/loss condition evaluation (all player/enemy ships sank).

## Phase 4: Application & Infrastructure
- [x] **Configuration** (`src/infrastructure/config/`)
    - [x] Define global settings and layouts for each mode type.
- [x] **Game Loop Engine** (`src/application/game-loop/`)
    - [x] Build the Game State Machine (`MAIN_MENU`, `SETUP_BOARD`, `PLAYER_TURN`, `ENEMY_TURN`, `GAME_OVER`).
    - [x] Implement state transition logic and turn orchestration.
- [x] **Storage Mechanism** (`src/infrastructure/storage/`)
    - [x] Implement `localStorage` or `IndexedDB` data adapter.
    - [x] Create Game Save & Load logic supporting exactly 3 save slots.

## Phase 5: UI & Overlays
- [ ] **Main Menu** (`src/presentation/ui/menu/`)
    - [ ] Implement "New Game" flow with mode selection (Classic, Russian, Rogue placeholder).
    - [ ] Implement Save/Load slot selection UI.
- [ ] **HUD** (`src/presentation/ui/hud/`)
    - [ ] Create active turn indicator.
    - [ ] Display remaining fleet status visualization for both players.
- [ ] **Settings Screen** (`src/presentation/ui/settings/`)
    - [ ] Implement toggles for HUD elements and interactions (highlighting).
    - [ ] Implement Enemy AI difficulty selector.

## Phase 6: Core Game Integration
- [ ] Connect Main Menu start actions to trigger the Application State Machine.
- [ ] Bind 3D interaction (clicking grid) to Domain placement logic during `SETUP_BOARD`.
- [ ] Bind grid clicking to attack logic during `PLAYER_TURN`.
- [ ] Hook Domain attack events (Hit, Miss, Sink) to update UI remaining fleet and HUD.
- [ ] Bind Game Over state to show end-game UI screens.

## Phase 7: AI Integration
- [ ] **Easy AI** (`src/application/ai/`)
    - [ ] Implement purely random targeting without memory.
- [ ] **Normal AI** (`src/application/ai/`)
    - [ ] Implement hunt-and-target logic (random until hit, then search adjacent tiles).
- [ ] **Hard AI** (`src/application/ai/`)
    - [ ] Implement probabilistic heatmap generation (Monte Carlo calculation to find ships based on remaining fleet).
- [ ] Integrate the selected AI difficulty into the `ENEMY_TURN` state.

## Phase 8: Visual Polish & "Minecraft Feel"
- [ ] **Voxel Water Shader** (`src/presentation/3d/materials/`)
    - [ ] Refine fragment/vertex shaders to create undulating waves.
    - [ ] Accept properties/uniforms for projectile splashes and wakes.
- [ ] **Destruction Effects**
    - [ ] Implement voxel hiding/removal when ship segments are "hit".
    - [ ] Build a lightweight voxel explosion particle system.
    - [ ] Spawn floating grey smoke (particles/voxels) from hit spots.
    - [ ] Spawn heavy black smoke and underwater wreckage visuals on "sank" coordinate locations.
- [ ] **Animations & Polish**
    - [ ] Add smoothly lerped camera transitions between phases.
    - [ ] Implement ship attacking animation (selecting random player ship to visually trace the projectile from).
