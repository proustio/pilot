# Rogue Mode Feature Readiness Report

This document outlines the current status of the Rogue mode implementation against the requirements defined in the steering documentation and recent architectural updates.

## Phase 1: Core Mechanics

| Requirement                    | Status | Details                                                               |
| :----------------------------- | :----: | :-------------------------------------------------------------------- |
| **20x20 Grid Support**         |   ✅   | Fully integrated in `Board`, `UIManager`, and `Engine3D`.             |
| **Shared Board Architecture**  |   ✅   | Both players interact with a single 20x20 `sharedBoard` instance.     |
| **Quadrant-based Placement**   |   ✅   | Enforcement for [0-6, 0-6] (Player) and [13-19, 13-19] (AI) active.   |
| **Unit-based Fog of War**      |   ✅   | Dynamic 5-cell radius visibility around player ships implemented.     |
| **Movable Ships (Player)**     |   ✅   | Players can move ships within their action phase using AP (moves).    |
| **Directional Movement Cost**  |   ✅   | Forward: 0.5x, Lateral: 1.0x, Backward: 2.0x cost implemented.        |
| **Dead Ships Block Cells**     |   ✅   | Sunk ship segments correctly block movement and placement.            |
| **Static Board Orientation**   |   ✅   | Board does not flip; camera behavior is unified for Rogue mode.       |
| **Ship Skip Action**           |   ✅   | Explicit "SKIP" button in the Action Bar allows ending a ship's turn. |
| **Special Weapons (Domain)**   |   ✅   | 3D Sonar Buoys & Proximity Mines fully integrated.              |
| **Transient Markers**          |   ✅   | Hit/miss markers cleared at the start of each turn.                   |

## Phase 2: Implementation Gaps (Blocking Feature Complete)

### 1. Special Weapon Integration & Visuals
- **Sonar Ping**: ✅ Persistent 3D Buoy with 7-cell vision radius and sinking remains.
- **Mines**: ✅ 3D Voxel models with 1-cell (8-neighbor) proximity trigger and explosion visuals.
- **Resource Persistence**: ✅ Ship flags (`isEnemy`, `isSpecialWeapon`) and resources fully persistent across refreshes.

### 2. Rogue AI Strategic Movement
The `AIEngine.ts` remains purely attack-oriented.
- **Action Required**: Implement movement heuristics to allow AI ships to evade detection or reposition.

### 3. Ship Model Excellence
The current voxel models require a premium iteration:
- **Heavy Weaponry**: Add "huge guns" (large turrets) to all combat vessels.
- **Flightdeck**: Specific model update for the Aircraft Carrier to include a flightdeck and launch bay visuals.

### 4. Transient Marker Lifecycle
- **Status**: ✅ Implemented in `EntityManager` via `REQUEST_MARKER_CLEANUP`.

### 5. UI/UX Refinement
- **Arsenals**: ✅ HUD updated with new icons (🚤, 📡, 💣) and reactive spent states.

## Conclusion: Roadmap to Rogue-Complete
With the completion of **Special Weapons, State Persistence, and Transient Markers**, the core system for Rogue mode is now technically feature-complete. The remaining effort focuses on **evasive AI movement** and **aesthetic excellence** for ship models (huge guns and flightdeck).
