# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Per-Frame Unconditional Fog Recalculation
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate `updateRogueFog()` runs every frame even when no state has changed
  - **Scoped PBT Approach**: For this deterministic bug, scope the property to concrete cases: call `VesselVisibilityManager.update()` N times with no intervening fog-dirty events and assert `updateRogueFog` inner loop executes ≤ 1 time (not N times)
  - Create test file at `src/presentation/3d/entities/__tests__/FogManager.bugCondition.test.ts`
  - Mock THREE.js (follow pattern from `FogManager.rogue.test.ts`) and set `Config.board.width = 20`, `Config.board.height = 20`
  - Create a `FogManager` in rogue mode with a player ship at (10, 10) with `visionRadius = 5`
  - Spy on the inner loop execution of `updateRogueFog()` (e.g., track calls to `ship.getOccupiedCoordinates()` or material opacity writes)
  - Call `updateRogueFog([playerShip])` 60 times with no state changes between calls
  - Assert: inner loop should execute at most 1 time (the first call), not 60 times
  - On unfixed code: the spy will show 60 full executions → test FAILS (confirms bug exists)
  - Document counterexamples: "updateRogueFog iterates all 400 cells on every call regardless of state changes"
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - isCellRevealed Correctness and Classic Mode Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Create test file at `src/presentation/3d/entities/__tests__/FogManager.preservation.test.ts`
  - Mock THREE.js (follow pattern from `FogManager.rogue.test.ts`)
  - **Observation phase** (run on UNFIXED code to capture baseline):
    - Observe: `isCellRevealed(10, 10)` returns `true` when player ship at (10,10) with visionRadius=5 (within radius)
    - Observe: `isCellRevealed(0, 0)` returns `false` when player ship at (10,10) with visionRadius=5 (outside radius)
    - Observe: `isCellRevealed(x, z)` returns `true` for temporarily revealed cells regardless of ship positions
    - Observe: `isCellRevealed(x, z)` returns `true` for permanently revealed cells regardless of ship positions
    - Observe: `isCellRevealed(x, z)` returns `true` for cells in setup quadrant (x<7, z<7) during setup phase
    - Observe: `isCellRevealed(x, z)` returns `true` for cells containing hit/sunk ship segments
    - Observe: Classic mode (`rogueMode = false`) — `updateRogueFog` returns early, fog meshes unaffected
  - **Property-based tests** (generate many inputs for stronger guarantees):
    - For random player ship positions (0–19, 0–19) and random query cells, verify `isCellRevealed` returns `true` iff Chebyshev distance ≤ visionRadius, or cell is temporarily/permanently revealed, or cell is in setup quadrant during setup, or cell has hit/sunk segment
    - For random reveal sets (temporary + permanent), verify `isCellRevealed` returns `true` for all revealed cells
    - For Classic mode (`rogueMode = false`), verify `updateRogueFog` is a no-op (returns immediately, no cell iteration)
    - For `reset()`, verify all fog state is cleared (temporarilyRevealedCells, permanentlyRevealedCells, isInitialized)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.5, 3.6_

- [ ] 3. Implement dirty flag fog optimization

  - [ ] 3.1 Add dirty flag and guard to FogManager
    - Add `private fogDirty: boolean = true` field to `FogManager` (initially true so first call computes fog)
    - Add `public markFogDirty(): void` method that sets `this.fogDirty = true`
    - Add `public isFogDirty(): boolean` method that returns `this.fogDirty`
    - In `updateRogueFog()`, after the existing `if (!this.rogueMode) return;` check, add `if (!this.fogDirty) return;`
    - At the end of `updateRogueFog()` (after the full cell iteration loop), set `this.fogDirty = false`
    - In `reset()`, set `this.fogDirty = true` so the next match starts with a fresh computation
    - _Bug_Condition: isBugCondition(input) where rogueMode === true AND framesSinceLastFogEvent > 0 AND updateRogueFogCalledThisFrame === true_
    - _Expected_Behavior: updateRogueFog skips computation when fogDirty === false, executes fully when fogDirty === true_
    - _Preservation: Classic mode early-return unchanged, reset() clears all state_
    - _Requirements: 2.1, 2.3_

  - [ ] 3.2 Mark fog dirty on state-change methods in FogManager
    - In `revealCellTemporarily()`, add `this.fogDirty = true` after modifying `temporarilyRevealedCells`
    - In `revealCellPermanently()`, add `this.fogDirty = true` after modifying `permanentlyRevealedCells`
    - In `onTurnChange()`, add `this.fogDirty = true` after decrementing temporary reveals
    - In `setSetupPhase()`, add `this.fogDirty = true` after setting `this.isSetupPhase`
    - _Bug_Condition: These methods modify fog-relevant state that must trigger recalculation_
    - _Expected_Behavior: Each state-change method sets fogDirty = true so next updateRogueFog() recomputes_
    - _Preservation: Method behavior unchanged — only adds dirty flag setting_
    - _Requirements: 2.3_

  - [ ] 3.3 Snap opacity instead of lerp in updateRogueFog
    - In `updateRogueFog()`, replace the lerp logic `mat.opacity += (targetOpacity - mat.opacity) * activeLerp` with direct snap `mat.opacity = targetOpacity`
    - Remove the `lerpFactor` and `activeLerp` variables since they are no longer needed
    - This ensures fog state is visually correct after a single event-driven recalculation pass
    - _Bug_Condition: Lerp requires multiple frames to converge, making per-frame calls load-bearing_
    - _Expected_Behavior: Opacity reaches target in one pass, no multi-frame dependency_
    - _Preservation: Final visual state identical — only convergence speed changes_
    - _Requirements: 2.2_

  - [ ] 3.4 Mark fog dirty on ship move in EntityManager
    - In `EntityManager` constructor, in the existing `eventBus.on(GameEventType.ROGUE_MOVE_SHIP, ...)` handler, add `this.fogManager.markFogDirty()` alongside the existing `this.visibilityManager.forceUpdate()` call
    - _Bug_Condition: Ship movement changes fog visibility but dirty flag must be set externally_
    - _Expected_Behavior: Fog recalculates once after each ship move event_
    - _Preservation: Existing forceUpdate() call unchanged_
    - _Requirements: 2.3_

  - [ ] 3.5 Mark fog dirty in VesselVisibilityManager.forceUpdate()
    - In `VesselVisibilityManager.forceUpdate()`, add `this.fogManager.markFogDirty()` so that any caller of `forceUpdate()` also triggers fog recalculation
    - _Bug_Condition: forceUpdate() is called on ship moves and should trigger fog recomputation_
    - _Expected_Behavior: forceUpdate() marks fog dirty in addition to updating enemy ship visibility_
    - _Preservation: Existing updateEnemyShipVisibility() call unchanged_
    - _Requirements: 2.3_

  - [ ] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Dirty Flag Prevents Redundant Updates
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (≤ 1 execution per N clean frames)
    - When this test passes, it confirms the dirty flag guard is working correctly
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - isCellRevealed Correctness and Classic Mode Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run `npm run test` to verify all existing tests plus new tests pass
  - Verify the existing `FogManager.rogue.test.ts` tests still pass
  - Ensure all tests pass, ask the user if questions arise
