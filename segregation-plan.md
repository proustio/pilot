# Segregation Plan

This document outlines the segregation plan for `EntityManager.ts`, `InteractionManager.ts`, and `GameLoop.ts` in compliance with the architecture paradigms defined in `.kiro/steering/structure.md`, particularly the **Delegation Pattern** where large classes (>300-400 lines) should act purely as thin coordinators by delegating logic to specialized handlers.

---

## 1. `GameLoop.ts` (412 lines)
**Current Issue:** `GameLoop` already delegates to `MatchSetup`, `TurnExecutor`, `GameEventManager`, and `RogueActionHandler` but still retains massive chunks of procedural logic (handling state transitions and weapons directly). 

**Segregation Targets:**
1. **Move Weapon Logic to `RogueActionHandler`:** 
   Extract the 80-line `handleRogueUseWeapon` method entirely. Move it into the existing `RogueActionHandler.ts`, which is already responsible for rogue-specific actions and turns. Update `GameEventManager` so that rogue weapon dispatch events hit the `RogueActionHandler` directly instead of `GameLoop`.
2. **Refactor `transitionTo` State Handlers:**
   The `transitionTo` method runs over 70 lines and handles deep, mode-specific initialization (e.g., sorting `rogueShipOrder`, `enemyRogueShipOrder`, and starting AI logic on turn edges). 
   - Move the Setup Board transition logic into `SetupBoardHandler` or `MatchSetup`.
   - Move the `PLAYER_TURN` and `ENEMY_TURN` setup logic into the `TurnExecutor.ts`. The `GameLoop.transitionTo` should *only* update the state enum, emit the events, and call a simple `.onEnterState(newState)` on its delegates, rather than implementing the state initialization internally.

---

## 2. `InteractionManager.ts` (391 lines)
**Current Issue:** While hovering and clicking have been delegated to `ClickHandler` and `InputFeedbackHandler`, `InteractionManager` itself calculates highlighting logic directly (move ranges, weapon ranges) and maintains complex state tracking.

**Segregation Targets:**
1. **Extract `RangeHighlighter.ts`:**
   In compliance with `structure.md` ("`RangeHighlighter.ts` - Weapon range visualization"), extract the `updateRangeHighlights` method (lines ~364-389) and the related state tracking (`lastMoveShipX`, etc.) into a dedicated `RangeHighlighter` class inside the `presentation/3d/interaction/` folder.
2. **Extract `MoveHighlighter.ts`:**
   Similar to the above, extract the `updateMoveHighlight` method (lines ~333-362) which computes where rogue ships can move based on remaining moves.
3. **Extract Interaction State Caching:**
   The `ghostCheckCache` and `lastInteractionState` logic spans multiple block checks to skip updates during frame renders. This caching strategy could be bundled into a small struct/service like `InteractionStateTracker` to keep the main `update()` loop under roughly 30-40 lines, solely piping coordinate logic between the Raycast service and the Feedback/Highlighter handlers.

---

## 3. `EntityManager.ts` (466 lines)
**Current Issue:** `EntityManager` correctly coordinates a dozen sub-managers (like `ParticleSystem`, `FogManager`, `ShipAnimator`), but its constructor has become a dumping ground holding 100+ lines of explicit `GameEventBus` routing. It also holds leftover procedural logic for markers and ship placements.

**Segregation Targets:**
1. **Extract `EntityEventCoordinator.ts`:**
   Remove the massive block of `eventBus.on(...)` handlers from the `EntityManager` constructor (e.g., `ROGUE_PATH_MOVE`, `ROGUE_SHIP_RAMMED`, `SONAR_RESULTS`). Create a dedicated `EntityEventCoordinator` that is constructed by `EntityManager` and wired up there. This keeps the `EntityManager` strictly about the 3D scene-graph and 3D update loops, not global business events.
2. **Extract `AttackMarkerManager.ts`:**
   `addAttackMarker`, `clearTransientMarkers`, and `revealSunkShip` are related concerns handling physical 3D representations of hit/miss pegs and sinking side-effects. This logic should be moved into a discrete manager or shifted to the already existing `ProjectileManager` / `VisibilityManager`.
3. **Extract `ShipPlacementCoordinator.ts`:**
   The complex `addShip` and `moveShip3D` functions deal with interpreting `Ship` domain objects (including `sonar` and `mine` special types) into Three.js Groups. This placement and reparenting logic should be broken out, perhaps leaving `EntityManager` with a simple flat API like `mountEntity(object3D)` while the Placement Coordinator manages the domain-to-3D mappings.

---

## Next Steps
Executing this plan will consistently bring all three files well under the 300-line threshold limit defined by the steering documentation, cleanly segregating domain and presentation responsibilities respectively. To proceed, we will implement these extractions incrementally, starting with `InteractionManager` as it is the most isolated, and moving to `EntityManager` and `GameLoop`.
