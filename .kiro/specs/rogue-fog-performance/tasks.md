# Implementation Plan

## Phase 1: CPU-Side Dirty Flag Optimization (COMPLETE)

- [x] 1. Write bug condition exploration test
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

- [x] 2. Write preservation property tests (BEFORE implementing fix)
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

- [x] 3. Implement dirty flag fog optimization

  - [x] 3.1 Add dirty flag and guard to FogManager
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

  - [x] 3.2 Mark fog dirty on state-change methods in FogManager
    - In `revealCellTemporarily()`, add `this.fogDirty = true` after modifying `temporarilyRevealedCells`
    - In `revealCellPermanently()`, add `this.fogDirty = true` after modifying `permanentlyRevealedCells`
    - In `onTurnChange()`, add `this.fogDirty = true` after decrementing temporary reveals
    - In `setSetupPhase()`, add `this.fogDirty = true` after setting `this.isSetupPhase`
    - _Bug_Condition: These methods modify fog-relevant state that must trigger recalculation_
    - _Expected_Behavior: Each state-change method sets fogDirty = true so next updateRogueFog() recomputes_
    - _Preservation: Method behavior unchanged — only adds dirty flag setting_
    - _Requirements: 2.3_

  - [x] 3.3 Snap opacity instead of lerp in updateRogueFog
    - In `updateRogueFog()`, replace the lerp logic `mat.opacity += (targetOpacity - mat.opacity) * activeLerp` with direct snap `mat.opacity = targetOpacity`
    - Remove the `lerpFactor` and `activeLerp` variables since they are no longer needed
    - This ensures fog state is visually correct after a single event-driven recalculation pass
    - _Bug_Condition: Lerp requires multiple frames to converge, making per-frame calls load-bearing_
    - _Expected_Behavior: Opacity reaches target in one pass, no multi-frame dependency_
    - _Preservation: Final visual state identical — only convergence speed changes_
    - _Requirements: 2.2_

  - [x] 3.4 Mark fog dirty on ship move in EntityManager
    - In `EntityManager` constructor, in the existing `eventBus.on(GameEventType.ROGUE_MOVE_SHIP, ...)` handler, add `this.fogManager.markFogDirty()` alongside the existing `this.visibilityManager.forceUpdate()` call
    - _Bug_Condition: Ship movement changes fog visibility but dirty flag must be set externally_
    - _Expected_Behavior: Fog recalculates once after each ship move event_
    - _Preservation: Existing forceUpdate() call unchanged_
    - _Requirements: 2.3_

  - [x] 3.5 Mark fog dirty in VesselVisibilityManager.forceUpdate()
    - In `VesselVisibilityManager.forceUpdate()`, add `this.fogManager.markFogDirty()` so that any caller of `forceUpdate()` also triggers fog recalculation
    - _Bug_Condition: forceUpdate() is called on ship moves and should trigger fog recomputation_
    - _Expected_Behavior: forceUpdate() marks fog dirty in addition to updating enemy ship visibility_
    - _Preservation: Existing updateEnemyShipVisibility() call unchanged_
    - _Requirements: 2.3_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Dirty Flag Prevents Redundant Updates
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (≤ 1 execution per N clean frames)
    - When this test passes, it confirms the dirty flag guard is working correctly
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - isCellRevealed Correctness and Classic Mode Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run `npm run test` to verify all existing tests plus new tests pass
  - Verify the existing `FogManager.rogue.test.ts` tests still pass
  - Ensure all tests pass, ask the user if questions arise

## Phase 2: GPU-Side Consolidated Fog & Wireframe Removal

- [x] 5. Write Phase 2 bug condition exploration tests
  - **Property 3: Bug Condition** - Per-Cell InstancedMesh Architecture and Wireframe Overlay
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the GPU bottleneck exists
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate per-cell fog mesh creation and wireframe overlay
  - Create test file at `src/presentation/3d/entities/__tests__/FogManager.consolidation.test.ts`
  - Mock THREE.js (follow pattern from `FogManager.rogue.test.ts`) and set `Config.board.width = 20`, `Config.board.height = 20`
  - **Test 1 — InstancedMesh count**: Initialize Rogue mode FogManager, trigger `updateRogueFog()` with ships revealing ~50 cells. Count `InstancedMesh` fog objects created. Expect ~150 on unfixed code (will fail assertion of ≤ 2)
  - **Test 2 — Material clone count**: Count unique material instances across fog meshes. Expect ~150 cloned materials on unfixed code (will fail assertion of ≤ 1 shared material)
  - **Test 3 — Voxel instance count**: Count total voxel instances across all fog meshes (250 per cell × ~150 cells). Expect ~37,500 on unfixed code (will fail assertion of ≤ 15,000)
  - **Test 4 — Ship wireframe overlay**: Create a ship via `ShipFactory.createShip()` and count `InstancedMesh` children in the ship group. Expect 2 on unfixed code (hull + wireframe, will fail assertion of ≤ 1)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All 4 tests FAIL (confirms GPU bottleneck exists)
  - Document counterexamples: "~150 separate InstancedMesh objects, ~150 cloned materials, ~37,500 voxel instances, 2 InstancedMesh per ship"
  - _Requirements: 1.4, 1.5, 1.6, 1.7_

- [x] 6. Implement consolidated fog InstancedMesh in FogManager

  - [x] 6.1 Add consolidated mesh fields and `initConsolidatedFog()` method to FogManager
    - Add fields: `consolidatedFogMesh: THREE.InstancedMesh | null`, `rogueVoxelsPerCell = 60`, `maxFogCapacity`
    - Implement `initConsolidatedFog(parentGroup: THREE.Group)`:
      - Create single `InstancedMesh` with capacity `boardWidth × boardHeight × rogueVoxelsPerCell` using `this.fogGeo` and `this.fogMatProto` directly (no clone)
      - Pre-generate per-instance attributes (`aBasePos`, `aScale`, `aPhase`, `aSpeed`) for 60 voxels per cell (same random distributions as current 250-voxel approach)
      - Set `mesh.count = 0` initially, add to `parentGroup`, store in `this.consolidatedFogMesh`
    - _Bug_Condition: Per-cell InstancedMesh creation produces ~150 draw calls_
    - _Expected_Behavior: Single consolidated InstancedMesh with shared material = 1 draw call_
    - _Preservation: Classic mode fog creation unchanged_
    - _Requirements: 2.4, 2.5_

  - [x] 6.2 Rewrite `updateRogueFog()` to rebuild consolidated mesh instances
    - Keep existing visibility logic (Chebyshev distance, reveals, setup phase, hit/sunk segments)
    - Instead of creating/removing per-cell meshes, rebuild consolidated mesh instance matrices:
      - For each fogged cell (`targetOpacity > 0.01`): compute cell world position, set instance matrices for its 60 voxels at that position
      - Increment instance counter per active voxel
    - Set `consolidatedFogMesh.count = totalActiveVoxels` and mark `instanceMatrix.needsUpdate = true`
    - Remove all per-cell mesh creation/removal code (`new THREE.InstancedMesh(...)`, `fogMatProto.clone()`, `parent.remove(fogMesh)`)
    - _Bug_Condition: Per-cell mesh creation with cloned materials prevents GPU batching_
    - _Expected_Behavior: Consolidated mesh rebuilt each dirty update, single draw call for all fog_
    - _Preservation: Visibility logic (Chebyshev, reveals, setup, hit/sunk) unchanged_
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 6.3 Update `updateAnimation()` to use fogMatProto directly
    - Update `uFogTime` on `this.fogMatProto.userData.shader` instead of searching `fogMeshes[]` for a non-null mesh
    - Since the consolidated mesh uses `fogMatProto` directly (no clone), the uniform update applies to all fog automatically
    - _Bug_Condition: Current code searches fogMeshes[] array to find shader reference_
    - _Expected_Behavior: Direct access to fogMatProto.userData.shader for uniform update_
    - _Preservation: Fog animation (bobbing, rotation) visually unchanged_
    - _Requirements: 3.3_

  - [x] 6.4 Update `reset()` to dispose consolidated mesh
    - If `consolidatedFogMesh` exists: remove from scene, dispose geometry references, set to `null`
    - Set `fogDirty = true` so next match reinitializes
    - Classic mode reset logic unchanged
    - _Bug_Condition: Consolidated mesh must be cleaned up on match reset_
    - _Expected_Behavior: reset() disposes consolidated mesh and reinitializes state cleanly_
    - _Preservation: Classic mode reset behavior unchanged, Phase 1 dirty flag reset preserved_
    - _Requirements: 3.6_

  - [x] 6.5 Update `clearFogCell()` and `clearFogByIndex()` for consolidated mesh
    - In Rogue mode, these methods should mark fog dirty (`this.fogDirty = true`) instead of removing individual meshes
    - The consolidated mesh will be rebuilt on the next `updateRogueFog()` call, excluding cleared cells
    - Classic mode behavior (direct mesh removal) unchanged
    - _Bug_Condition: Per-cell removal doesn't apply to consolidated mesh architecture_
    - _Expected_Behavior: Mark dirty so consolidated mesh rebuilds without cleared cells_
    - _Preservation: Classic mode clearFogCell/clearFogByIndex unchanged_
    - _Requirements: 2.4, 3.2_

- [x] 7. Update BoardBuilder for Rogue mode fog
  - Create reduced-voxel fog geometry for Rogue mode (`rogueNumVoxels = 60` instead of 250)
  - Generate `aBasePos`, `aScale`, `aPhase`, `aSpeed` instanced buffer attributes sized for 60 voxels with same random distributions
  - Pass appropriate geometry to `fogManager.initializeDynamicAssets()` based on `rogueMode`
  - Call `fogManager.initConsolidatedFog(playerBoardGroup)` after the grid tile loop when `rogueMode === true`
  - Per-cell fog cloud creation already skipped in Rogue mode (`if (!fogManager.rogueMode)` guard exists)
  - _Bug_Condition: 250 voxels per cell × ~150 cells = ~450K triangles from fog alone_
  - _Expected_Behavior: 60 voxels per cell reduces total fog triangles to ~60-100K_
  - _Preservation: Classic mode fog geometry (250 voxels) unchanged_
  - _Requirements: 2.6, 3.1_

- [x] 8. Remove ship wireframe overlay from ShipFactory

  - [x] 8.1 Remove `instancedLines` creation from `ShipFactory.createShip()`
    - Delete the wireframe `InstancedMesh` creation block (`new THREE.InstancedMesh(new THREE.BoxGeometry(voxelSize * 1.01, ...), new THREE.MeshBasicMaterial({wireframe: true, ...}), ...)`)
    - Delete `shipGroup.add(instancedLines)`
    - Delete wireframe geometry creation (`new THREE.BoxGeometry(voxelSize * 1.01, ...)`)
    - _Bug_Condition: Each ship creates a second InstancedMesh as wireframe overlay, doubling draw calls per ship_
    - _Expected_Behavior: Ships render with hull InstancedMesh only, no wireframe overlay_
    - _Requirements: 2.7_

  - [x] 8.2 Remove `instancedLines` from `updateShipTheme()` and `dispose()`
    - In `updateShipTheme()`: remove `(instancedLines.material as THREE.MeshBasicMaterial).color.copy(currentAccent)`, remove `instancedLines.setColorAt()` loop, remove `instancedLines.instanceColor.needsUpdate`
    - In `shipGroup.userData.dispose`: remove `instancedLines.dispose()`, `instancedLines.geometry.dispose()`, `(instancedLines.material).dispose()`
    - _Bug_Condition: Theme update and dispose reference wireframe mesh that no longer exists_
    - _Expected_Behavior: Theme update and dispose only reference hull instancedMesh_
    - _Requirements: 2.7_

  - [x] 8.3 Remove `instancedLines` references from `VesselVisibilityManager.updateShipPartialVisibility()`
    - Delete the line: `const instancedLines = shipGroup.children.find(c => c instanceof THREE.InstancedMesh && c !== instancedMesh) as THREE.InstancedMesh`
    - Delete the call: `updateMesh(instancedLines)`
    - Only `updateMesh(instancedMesh)` remains for hull visibility updates
    - _Bug_Condition: Partial visibility update references wireframe mesh that no longer exists_
    - _Expected_Behavior: Partial visibility only updates hull instancedMesh_
    - _Preservation: Ship hull partial visibility logic unchanged_
    - _Requirements: 2.7, 3.4_

- [ ] 9. Verify Phase 2 tests

  - [ ] 9.1 Verify Phase 2 bug condition exploration tests now pass
    - **Property 3: Expected Behavior** - Consolidated Fog and No Wireframe
    - **IMPORTANT**: Re-run the SAME tests from task 5 — do NOT write new tests
    - The tests from task 5 encode the expected behavior (≤ 2 fog InstancedMesh, ≤ 1 material, ≤ 15,000 voxels, ≤ 1 InstancedMesh per ship)
    - Run `FogManager.consolidation.test.ts` tests
    - **EXPECTED OUTCOME**: All 4 tests PASS (confirms GPU bottleneck is fixed)
    - _Requirements: 2.4, 2.5, 2.6, 2.7_

  - [ ] 9.2 Verify Phase 1 preservation tests still pass
    - **Property 2: Preservation** - isCellRevealed Correctness and Classic Mode Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `FogManager.preservation.test.ts` tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions from Phase 2 changes)
    - _Requirements: 3.1, 3.2, 3.5, 3.6_

  - [ ] 9.3 Run all tests (`npm run test`)
    - Run full test suite to verify no regressions across the codebase
    - **EXPECTED OUTCOME**: All tests pass

- [ ] 10. Checkpoint - Ensure all Phase 2 tests pass
  - Run full test suite (`npm run test`)
  - Verify `FogManager.rogue.test.ts` still passes (existing tests)
  - Verify `FogManager.bugCondition.test.ts` still passes (Phase 1 exploration test)
  - Verify `FogManager.preservation.test.ts` still passes (Phase 1 preservation tests)
  - Verify `FogManager.consolidation.test.ts` passes (Phase 2 exploration tests)
  - Ensure all tests pass, ask the user if questions arise
