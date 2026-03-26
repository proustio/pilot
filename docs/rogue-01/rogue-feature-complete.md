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
| **Special Weapons (Domain)**   |   ⏳   | Logic exists but lacks 3D revelation/impact (Mines/Sonar).            |
| **Transient Markers**          |   ❌   | Hit/miss markers currently persist permanently.                       |

## Phase 2: Implementation Gaps (Blocking Feature Complete)

### 1. Special Weapon Integration & Visuals
Current weapons are "headless" (domain logic only).
- **Sonar Ping**: Needs visual "expanding ring" and temporary 3D revelation of fog/ships.
- **Mines**: Needs 3D voxel models, placement animations, and visual explosion on contact.
- **Resource Persistence**: Initial work in `Ship.resources` needs to be fully stateful across sessions.

### 2. Rogue AI Strategic Movement
The `AIEngine.ts` remains purely attack-oriented.
- **Action Required**: Implement movement heuristics to allow AI ships to evade detection or reposition.

### 3. Ship Model Excellence
The current voxel models require a premium iteration:
- **Heavy Weaponry**: Add "huge guns" (large turrets) to all combat vessels.
- **Flightdeck**: Specific model update for the Aircraft Carrier to include a flightdeck and launch bay visuals.

### 4. Transient Marker Lifecycle
- **Action Required**: Implement marker cleanup logic to remove hit/miss indicators after the opponent's turn.

### 5. UI/UX Refinement
- **Arsenals**: HUD should clearly show remaining charges for special systems.
- **Spent States**: Visual overlay/dimming for buttons when resources are exhausted.

## Conclusion: Roadmap to Rogue-Complete
Verification shows that while core grid and movement mechanics are stable, **Special Weapons and AI Intelligence** are the primary blockers for feature completion. The next iteration should prioritize the **3D feedback for Mines/Sonar** and **Ship Model upgrades**.
