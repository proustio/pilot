# Rogue Mode Feature Readiness Report

This document outlines the current status of the Rogue mode implementation against the requirements defined in the steering documentation.

## Phase 1 Readiness Checklist

| Requirement | Status | Details |
| :--- | :---: | :--- |
| **20x20 Grid Support** | ✅ | Fully integrated in `Board`, `UIManager`, and `Engine3D`. |
| **Shared Board Architecture** | ✅ | Both players interact with a single 20x20 `enemyBoard` instance. |
| **Quadrant-based Placement** | ✅ | Player (TL: 0-9) and AI (BR: 10-19) placement zones enforced. |
| **Unit-based Fog of War** | ✅ | Dynamic 5-cell radius visibility around player ships implemented. |
| **Movable Ships (Player)** | ✅ | Players can move ships within their action phase. |
| **Movable Ships (AI)** | ❌ | AI currently only attacks; ship movement logic is missing. |
| **Special Weapon Systems** | ✅ | Sonar, Mines, and AirStrikes are functional in the domain layer. |
| **Transient Hit/Miss Markers** | ❌ | Markers currently persist; cleanup logic after turns is missing. |
| **Dead Ships Block Cells** | ✅ | Sunk ship segments correctly block movement and placement. |
| **Static Board Orientation** | ✅ | Board does not flip; camera behavior is unified for Rogue mode. |
| **Ship Skip Action** | ✅ | Explicit "SKIP" button in the Action Bar allows ending a ship's turn. |

## Implementation Gap Analysis

### 1. Transient Marker Lifecycle
The `product.md` specification requires hit and miss markers to vanish after the next opponent's turn. Currently, `Board.ts` and `GameLoop.ts` do not have a mechanism to track marker age or "garbage collect" transient states.
> **Action**: Implement a `clearTransientMarkers()` method in `Board.ts` and call it at the start of a turn in `GameLoop.ts`.

### 2. Rogue AI Strategic Movement
The `AIEngine.ts` is currently "Classic-centric." It only computes attack coordinates. In Rogue mode, the AI needs to evaluate ship positions to evade revealed areas or reposition for better coverage.
> **Action**: Enhance `AIEngine` with a movement heuristic that moves AI ships towards strategic positions or away from player vision.

### 3. Special Weapon Visual Polish
Current special weapons (Sonar, AirStrike) have domain logic but could benefit from more distinct 3D effects (e.g., sonar expanding ring, air strike voxel shadows).

## Conclusion: Road to Feature Complete
The Rogue mode is approximately **85% complete**. The core architecture (shared board, 20x20 grid, fog of war) is solid. The remaining 15% involves implementing the transient marker lifecycle, enhancing the AI to move its ships, and polishing special weapon effects.

Once the marker cleanup and AI movement are implemented, Rogue mode can be shifted from its current "Experimental" status to a "Feature Complete" baseline.
