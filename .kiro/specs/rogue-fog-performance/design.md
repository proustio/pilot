# Rogue Fog Performance Bugfix Design

## Overview

Rogue mode on a 20×20 board suffers from poor frame rates because `FogManager.updateRogueFog()` runs every frame via `VesselVisibilityManager.update()`. This method iterates all 400 board cells × all ship segments and lerps material opacity 60 times per second, even when nothing has changed. The fix is scoped to a single change: move fog recalculation from per-frame to event-driven, triggering it only at the end of ship actions (move, attack, skip) and on turn/phase changes. Per-cell `InstancedMesh` fog architecture, wireframe overlays, voxel counts, and material sharing are all left unchanged.

## Glossary

- **Bug_Condition (C)**: Rogue mode is active and `updateRogueFog()` is called unconditionally every frame in `VesselVisibilityManager.update()`, running the O(cells × ships) visibility loop + opacity lerping ~60 times per second
- **Property (P)**: Fog recalculation runs only when fog state is dirty (after ship actions and turn/phase changes), reducing the heavy computation from ~60×/sec to a few times per turn
- **Preservation**: Classic/Russian mode fog, `isCellRevealed()` game logic, fog animation, visual fog appearance, per-cell fog mesh architecture, ship wireframe overlays, and reset cleanup must remain unchanged
- **FogManager**: The class in `src/presentation/3d/entities/FogManager.ts` that manages fog-of-war meshes and visibility state
- **VesselVisibilityManager**: The class in `src/presentation/3d/entities/VesselVisibilityManager.ts` that currently calls `updateRogueFog()` every frame via its `update()` method
- **GameEventBus**: The typed pub/sub singleton in `src/application/events/GameEventBus.ts` used for cross-layer communication

## Bug Details

### Bug Condition

The bug manifests when Rogue mode is active on a 20×20 board. `VesselVisibilityManager.update()` is called every frame by `EntityManager.update()`, and it unconditionally calls `this.fogManager.updateRogueFog(this.allShips)`. The inner loop iterates all 400 cells and all ship segments, computing Chebyshev distances and lerping material opacity, even when no game state has changed since the last frame.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { rogueMode: boolean, framesSinceLastFogEvent: number }
  OUTPUT: boolean

  RETURN input.rogueMode === true
         AND input.framesSinceLastFogEvent > 0
         AND updateRogueFogCalledThisFrame(input) === true
END FUNCTION
```

### Examples

- **Static frame, no state change → full 400-cell iteration**: Player is thinking about their next move. No ship has moved, no cell revealed, no turn change. Yet `updateRogueFog` iterates all 400 cells × all ship segments and lerps opacity every single frame. Expected: skip computation entirely.
- **60 frames between two ship moves → 60 redundant fog updates**: Player moves ship A, then 1 second later moves ship B. During that second, `updateRogueFog` runs 60 times with identical results. Expected: fog recalculates once after ship A moves, once after ship B moves (2 total, not 60).
- **Enemy turn with 5 ships acting sequentially → fog updates every frame during animations**: While enemy ships animate their moves/attacks over ~4 seconds, fog recalculates ~240 times. Expected: fog recalculates once per enemy action completion (~5 times total).
- **Setup phase with no interaction → continuous fog updates**: During ship placement, fog updates every frame even though fog state only changes when `setSetupPhase()` is called. Expected: fog recalculates once on setup phase entry.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Classic/Russian mode (10×10, `rogueMode === false`) must continue to work identically — `updateRogueFog` already returns early when `!this.rogueMode`
- `isCellRevealed(x, z)` must return identical results for all inputs: ship proximity, temporary reveals, permanent reveals, sunk ships, hit segments, and setup-phase quadrant visibility
- Fog voxel animation (bobbing, rotation via `uFogTime` uniform in vertex shader) must continue to display smoothly via `updateAnimation()` which remains per-frame
- Per-cell `InstancedMesh` fog architecture (one mesh per fogged cell, 250 voxels each) must remain unchanged
- Ship wireframe overlay `InstancedMesh` objects must remain unchanged
- Material cloning per fog cell must remain unchanged
- `FogManager.reset()` must properly dispose all fog meshes and reinitialize state cleanly
- Enemy ship visibility updates in `VesselVisibilityManager` must continue at their existing throttled rate

**Scope:**
All inputs that do NOT involve the frequency of `updateRogueFog()` calls should be completely unaffected by this fix. This includes:
- The internal logic of `updateRogueFog()` (cell iteration, distance computation, opacity lerping)
- Classic/Russian mode fog rendering
- Game logic queries via `isCellRevealed()`
- Ship creation and rendering
- Fog animation shader behavior
- All non-fog draw calls (water, grid, markers, particles)

## Hypothesized Root Cause

Based on the code analysis, the root cause is straightforward:

1. **Unconditional Per-Frame Fog Recalculation**: `VesselVisibilityManager.update()` (line 23) calls `this.fogManager.updateRogueFog(this.allShips)` every frame with no dirty-checking. `EntityManager.update()` calls `this.visibilityManager.update(this.time)` every frame. The inner loop in `updateRogueFog()` iterates all `boardWidth × boardHeight` cells (400 on 20×20) and for each cell iterates all ship segments to compute Chebyshev distance. This is O(cells × shipSegments) per frame, running ~60 times per second.

2. **Per-Frame Opacity Lerping Without Need**: The opacity lerp (`mat.opacity += (targetOpacity - mat.opacity) * activeLerp`) runs every frame for every fogged cell. Once fog reaches its target opacity (which happens within ~10-20 frames of a state change), subsequent lerp calls produce negligible changes but still cost the full iteration.

3. **No Event-Driven Trigger Points**: The codebase already has `GameEventBus` events for all fog-relevant state changes (`TURN_CHANGED`, `ROGUE_MOVE_SHIP`, `ACTIVE_SHIP_CHANGED`, `GAME_STATE_CHANGED`) and `FogManager` already has methods called on state changes (`onTurnChange()`, `setSetupPhase()`, `revealCellTemporarily()`, `revealCellPermanently()`). But none of these trigger fog recalculation — they only modify internal state that gets picked up on the next per-frame `updateRogueFog()` call.

## Correctness Properties

Property 1: Bug Condition - Event-Driven Fog Recalculation

_For any_ sequence of N consecutive frames where no fog-dirty event occurs (no ship movement, no attack, no skip, no turn change, no setup phase change), the fixed system SHALL invoke `updateRogueFog()` zero times during those N frames, instead of N times.

**Validates: Requirements 2.3**

Property 2: Preservation - isCellRevealed Correctness

_For any_ board state with arbitrary ship positions, temporary reveals, permanent reveals, and setup phase configuration, the fixed `FogManager.isCellRevealed(x, z)` SHALL return the same boolean result as the original implementation for all valid coordinates (0 ≤ x < boardWidth, 0 ≤ z < boardHeight).

**Validates: Requirements 3.2, 3.5**

Property 3: Preservation - Fog Visual State After Events

_For any_ fog-triggering event (ship move, attack, skip, turn change, setup phase change), the fixed system SHALL call `updateRogueFog()` at least once after the event, producing the same fog opacity state as the original per-frame system would produce after convergence.

**Validates: Requirements 3.2, 3.3**

Property 4: Preservation - Classic Mode Fog Unchanged

_For any_ Classic or Russian mode board state (`rogueMode === false`), the fixed code SHALL not alter any fog behavior — `updateRogueFog()` already returns early when `!this.rogueMode`, and this early-return remains unchanged.

**Validates: Requirements 3.1**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/presentation/3d/entities/FogManager.ts`

**Specific Changes**:
1. **Add dirty flag**: Add a `private fogDirty: boolean = true` field. Set it to `true` initially so the first call computes fog.
2. **Add `markFogDirty()` public method**: Sets `fogDirty = true`.
3. **Add `isFogDirty()` public method**: Returns `fogDirty`.
4. **Guard `updateRogueFog()`**: At the top of `updateRogueFog()`, after the `if (!this.rogueMode) return;` check, add `if (!this.fogDirty) return;`. At the end of the method (after the full cell iteration), set `this.fogDirty = false`.
5. **Mark dirty on state changes**: In `revealCellTemporarily()`, `revealCellPermanently()`, `onTurnChange()`, and `setSetupPhase()`, call `this.fogDirty = true` so the next `updateRogueFog()` call will recompute.
6. **Snap opacity instead of lerp**: Since `updateRogueFog()` no longer runs every frame, the gradual lerp won't produce smooth transitions. Change the opacity update to snap directly to `targetOpacity` (i.e., `mat.opacity = targetOpacity`) instead of lerping. This ensures fog state is correct immediately after each event-driven recalculation.

**File**: `src/presentation/3d/entities/VesselVisibilityManager.ts`

**Function**: `update()`

**Specific Changes**:
7. **Keep the per-frame call but let the dirty guard handle it**: The existing `this.fogManager.updateRogueFog(this.allShips)` call in `update()` can remain as-is. The dirty flag inside `FogManager` will cause it to return immediately on clean frames. This is the simplest change — no need to restructure the call site.

**File**: `src/presentation/3d/entities/EntityManager.ts`

**Specific Changes**:
8. **Mark fog dirty on ship move**: The existing `eventBus.on(GameEventType.ROGUE_MOVE_SHIP, ...)` handler already calls `this.visibilityManager.forceUpdate()`. Add `this.fogManager.markFogDirty()` here (or inside `forceUpdate()`).
9. **Mark fog dirty on sonar/mine reveals**: The existing `SONAR_RESULTS` handler calls `revealCellTemporarily()` which will self-mark dirty (from change #5).

**File**: `src/application/events/GameEventBus.ts`

**Specific Changes**:
10. **Add `ROGUE_FOG_DIRTY` event type** (optional): Add a new `GameEventType.ROGUE_FOG_DIRTY` event that can be emitted from the application layer when ship actions complete. This allows `EntityManager` or `VesselVisibilityManager` to listen and mark fog dirty. Alternatively, the existing events (`ROGUE_MOVE_SHIP`, `TURN_CHANGED`, `GAME_STATE_CHANGED`, `ENEMY_ACTION`) can be used directly — the `EntityManager` already listens to several of these.

**Trigger Points** (where fog dirty must be set):
- After player ship moves: `ROGUE_MOVE_SHIP` event (already handled in EntityManager)
- After player ship attacks: attack result processing in `TurnExecutor.onPlayerTurnClick()` → `TURN_CHANGED` or via `advanceRogueShipTurn()`
- After player ship skips: `advanceRogueShipTurn()` → `ACTIVE_SHIP_CHANGED` or `TURN_CHANGED`
- After enemy ship moves/attacks: `ENEMY_ACTION` event
- On turn change: `TURN_CHANGED` event (already emitted by `GameLoop.transitionTo()`)
- On setup phase change: `setSetupPhase()` call (change #5 handles this)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that count how many times `updateRogueFog()` executes its inner loop across multiple frames with no state changes. Run these tests on the UNFIXED code to observe the per-frame execution.

**Test Cases**:
1. **Per-Frame Update Count Test**: Call `VesselVisibilityManager.update()` 60 times with no state changes — expect 60 full `updateRogueFog` executions on unfixed code (will fail assertion of ≤ 1)
2. **Static Board Iteration Test**: After initial fog setup, call `updateRogueFog()` 10 times with identical ship positions — expect 10 full cell iterations on unfixed code (will fail assertion of ≤ 1)
3. **Opacity Convergence Test**: After fog reaches target opacity, call `updateRogueFog()` — expect it still iterates all cells on unfixed code even though opacity changes are negligible

**Expected Counterexamples**:
- `updateRogueFog` inner loop executes every frame regardless of state changes
- Opacity lerp runs on every cell every frame even after convergence

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  callCount := countUpdateRogueFogExecutions(input.frames, input.dirtyEvents)
  ASSERT callCount === input.dirtyEvents
  ASSERT callCount < input.frames
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT FogManager_original.isCellRevealed(input.x, input.z) === FogManager_fixed.isCellRevealed(input.x, input.z)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random board states (ship positions, reveal sets, setup phase) automatically
- It catches edge cases in `isCellRevealed` logic that manual tests might miss (boundary cells, overlapping vision radii, simultaneous temporary + permanent reveals)
- It provides strong guarantees that the visibility query behavior is unchanged for all inputs

**Test Plan**: Observe behavior on UNFIXED code first for `isCellRevealed()` across many board states, then write property-based tests capturing that behavior.

**Test Cases**:
1. **isCellRevealed Preservation**: For random ship positions and reveal sets, verify `isCellRevealed(x, z)` returns identical results before and after the fix for all board coordinates
2. **Classic Mode Preservation**: Verify that with `rogueMode === false`, `updateRogueFog` remains a no-op and no dirty flag logic interferes
3. **Fog Animation Preservation**: Verify that `updateAnimation()` still runs per-frame and updates the `uFogTime` uniform on the shared material (this is separate from `updateRogueFog`)
4. **Reset Preservation**: Verify that `reset()` properly clears the dirty flag and all fog state

### Unit Tests

- Test that `updateRogueFog()` skips computation when `fogDirty === false`
- Test that `markFogDirty()` causes the next `updateRogueFog()` call to execute fully
- Test that `revealCellTemporarily()`, `revealCellPermanently()`, `onTurnChange()`, and `setSetupPhase()` all set `fogDirty = true`
- Test that after `updateRogueFog()` executes, `fogDirty` is set to `false`
- Test that opacity snaps to target value immediately (no multi-frame lerp dependency)

### Property-Based Tests

- Generate random Rogue board states (ship positions, vision radii, reveal sets) and verify `isCellRevealed` returns identical results to a reference implementation that always recomputes
- Generate random sequences of fog-dirty events interspersed with clean frames and verify `updateRogueFog` only executes on dirty frames
- Generate random ship configurations and verify fog opacity reaches correct final state after a single `updateRogueFog()` call (snap behavior)

### Integration Tests

- Test full Rogue mode turn flow: move ship → verify fog updates once → wait 60 frames → verify no additional fog updates
- Test enemy turn flow: enemy moves → verify fog updates after each enemy action → verify no updates between actions
- Test setup phase transition: enter setup → verify fog updates once → verify no updates while idle in setup
- Test that fog animation (bobbing/rotation via `updateAnimation()`) continues smoothly independent of fog recalculation frequency
