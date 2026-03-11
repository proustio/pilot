# Iteration 2 - Improvements Tasks

This document breaks down the actionable tasks based on `improvements-2.md` and aligns with the technical goals in `tech-breakdown.md` and `game-concept.md`.

## 1. Splash Effects
*Goal: Add a splash effect to the board when a projectile hits either water or a ship.*
- [x] Create a splash particle system or visual effect using Three.js / shaders.
- [x] Trigger the splash effect upon projectile impact with water.
- [x] Trigger the splash effect upon projectile impact with a ship.

## 2. Enhanced Ship Models & Destruction
*Goal: Make ships look more realistic and add dynamic damage/sinking animations to match the "minecraft feel".*
- [x] Update ship models (via `.vox` / `.glb` or instanced meshes) to be composed of more voxels, looking like real ships.
- [x] Implement a voxel explosion effect when a ship takes damage (voxels visibly fly out).
- [x] Add a grey smoke particle effect spawning from damaged ship segments.
- [x] Implement a sinking animation (translating downward into the water) for when a ship is destroyed.
- [x] Add a black smoke particle effect for sunken ships.

## 3. Unified Board & Game Stats
*Goal: Unify the player and enemy boards and display game statistics.*
- [x] Refactor the UI and 3D rendering to use a single unified board positioned at the top left.
- [x] Implement tracking for total "shots fired" in the Game Controller.
- [x] Implement tracking and calculation for "hit/miss ratio".
- [x] Update the HUD to display "shots fired" and "hit/miss ratio" stats.

## 4. Fog of War
*Goal: Hide unrevealed parts of the enemy board.*
- [x] Implement a "Fog of War" visual layer over the enemy's section of the board.
- [x] Update the rendering logic to reveal specific cells only after they have been targeted/shot at.

## 5. Game Options & Synchronization
*Goal: Improve the options menus, add pause functionality, and manage setting restrictions.*
- [ ] Make all configurable game options accessible both before the game starts and during active gameplay.
- [ ] Synchronize option states (e.g., toggles) between the pre-game main menu and mid-game HUD settings screens.
- [ ] Implement game pausing functionality when the options screen is opened during an active match (halting game loops/animations).
- [ ] Restrict the "Difficulty Level" setting so it can only be changed before the game starts.
- [ ] Visually grey out/disable the difficulty setting in the in-game options menu when a game is in progress.

---
*Item 1 (animated water board) from `improvements-2.md` is marked as [COMPLETE]. Items 4 and 7 were combined into Section 5 due to overlapping requirements.*
