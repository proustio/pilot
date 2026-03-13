# Save/Load Board Restore Bugfix Design

## Overview

After loading a saved game, the 3D battlefield renders an empty board with no attack markers (hits, misses, sinks) and ships appear undamaged, even though the minimap correctly shows all state. The root cause is that `GameLoop.loadMatch()` only replays ship placements via `replayShips()` but never replays attack results. The 3D `EntityManager` relies on `onAttackResult` callbacks to create marker meshes, so without attack replay the 3D scene is incomplete. The fix adds a `replayAttacks()` method to `GameLoop` that iterates both boards' `gridState` arrays and fires the appropriate `onAttackResult` callbacks for every cell with a Hit, Miss, or Sunk state. Attack replay must place markers instantly (no parabolic arc animation) to distinguish it from live gameplay.

## Glossary

- **Bug_Condition (C)**: A saved game is loaded whose boards contain cells with `CellState.Hit`, `CellState.Miss`, or `CellState.Sunk` — the 3D scene lacks corresponding attack markers
- **Property (P)**: After load, every attack-state cell in `Board.gridState` has a corresponding 3D marker in `EntityManager`, and ships display damage for hit/sunk segments
- **Preservation**: All existing behaviors unrelated to load-replay must remain unchanged — new game flow, live attack animations, save serialization, minimap rendering, and ViewState restoration
- **`GameLoop.loadMatch()`**: The method in `src/application/game-loop/GameLoop.ts` that restores a deserialized `Match` and transitions to `PLAYER_TURN`
- **`GameLoop.replayShips()`**: Private method that iterates both boards' ships and fires `onShipPlaced` listeners so `EntityManager.addShip()` creates 3D meshes
- **`EntityManager.addAttackMarker()`**: Method in `src/presentation/3d/entities/EntityManager.ts` that creates a rocket marker mesh with a parabolic arc animation
- **`Board.gridState`**: A 1D `CellState[]` array (index = `z * width + x`) representing the state of every cell on a 10×10 board
- **`CellState`**: Enum in `Board.ts` — `Empty(0)`, `Miss(1)`, `Ship(2)`, `Hit(3)`, `Sunk(4)`

## Bug Details

### Bug Condition

The bug manifests when a saved game is loaded that contains attack history. `GameLoop.loadMatch()` calls `replayShips()` to fire `onShipPlaced` listeners but has no equivalent replay for attack results. Since `EntityManager` only creates attack markers in response to `onAttackResult` callbacks, the 3D scene shows no hits, misses, or sunk markers after load. Ships also appear undamaged because `addShip()` renders them in pristine state regardless of segment damage.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { match: Match, action: 'load' }
  OUTPUT: boolean

  playerAttacks := COUNT cells in input.match.playerBoard.gridState
                   WHERE cell IN [CellState.Hit, CellState.Miss, CellState.Sunk]
  enemyAttacks  := COUNT cells in input.match.enemyBoard.gridState
                   WHERE cell IN [CellState.Hit, CellState.Miss, CellState.Sunk]

  RETURN input.action == 'load'
         AND (playerAttacks > 0 OR enemyAttacks > 0)
END FUNCTION
```

### Examples

- **Hit marker missing**: Save a game after the player fires at (3, 4) and hits an enemy ship. Load the save. The minimap shows a red cell at (3, 4) but the 3D enemy board has no red rocket marker at that position.
- **Miss marker missing**: Save after the enemy fires at (7, 2) and misses. Load the save. The minimap shows a grey cell at (7, 2) but the 3D player board has no grey marker.
- **Sunk ship not visually destroyed**: Save after sinking a 3-cell enemy ship at (1,1)→(3,1). Load the save. The minimap shows three sunk cells, but the 3D board shows the ship intact with no sunk markers.
- **Empty save (no bug)**: Save a game immediately after ship placement with zero attacks. Load the save. Both minimap and 3D board correctly show only ships — no attack markers expected.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- New game flow (`startNewMatch`) must continue to use the existing event-driven placement and attack flow without invoking any replay logic
- `Storage.saveGame()` serialization format and content must remain identical
- `UnifiedBoardUI.refresh()` must continue reading directly from `Board.gridState` for minimap rendering
- Live gameplay attacks (during `PLAYER_TURN` / `ENEMY_TURN`) must continue to animate with the parabolic arc trajectory, particle explosions, and splash effects
- `RESTORE_VIEW_STATE` event handling for camera, board orientation, day/night mode, and game speed must remain unchanged

**Scope:**
All inputs that do NOT involve loading a saved game with attack history should be completely unaffected by this fix. This includes:
- Starting a new game and playing through ship placement and attacks
- Saving a game at any point
- Minimap rendering during both new and loaded games
- All UI interactions (pause, settings, peek toggle)
- Camera controls and board flip animations

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is confirmed:

1. **Missing Attack Replay in `loadMatch()`**: `GameLoop.loadMatch()` (line 223) calls `replayShips(match)` to fire `onShipPlaced` listeners but has no corresponding `replayAttacks(match)` call. The `attackResultListeners` array is never invoked during load, so `EntityManager.addAttackMarker()` is never called for persisted attacks.

2. **No Instant-Placement Path for Markers**: `EntityManager.addAttackMarker()` always creates a parabolic arc animation (QuadraticBezierCurve3 from a friendly ship to the target cell). During load replay, markers should appear instantly at their final positions without animation. Currently no such path exists — the method needs either a flag parameter or a separate method for instant placement.

3. **Ship Damage State Not Reflected in 3D**: `EntityManager.addShip()` creates ships in pristine visual state. After deserialization, `Ship.segments` correctly contains `false` for hit segments, but `addShip()` doesn't read segment damage. When attack markers are replayed onto ship cells, the sunk-ship visual (sinking animation) may need to be triggered for fully sunk ships.

4. **Replay Order Matters**: Ships must be replayed before attacks so that `addAttackMarker()` can find friendly ship positions for the arc start point (though for instant placement this is less critical). The current `replayShips()` → new `replayAttacks()` order in `loadMatch()` is correct.

## Correctness Properties

Property 1: Bug Condition - Attack Markers Restored on Load

_For any_ loaded match where `isBugCondition` returns true (at least one cell in either board's `gridState` is `Hit`, `Miss`, or `Sunk`), the fixed `loadMatch` function SHALL fire `onAttackResult` callbacks for every such cell, causing `EntityManager` to create a corresponding 3D marker at the correct grid position with the correct result type (`hit`, `miss`, or `sunk`).

**Validates: Requirements 2.1, 2.3**

Property 2: Preservation - Non-Load Gameplay Unchanged

_For any_ gameplay action that is NOT a load operation (new game start, live player attack, live enemy attack, save, UI interaction), the fixed code SHALL produce exactly the same behavior as the original code, preserving the existing event-driven flow, attack animations with parabolic arcs, save serialization format, and minimap rendering from `Board.gridState`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/application/game-loop/GameLoop.ts`

**Function**: `loadMatch()` and new `replayAttacks()`

**Specific Changes**:
1. **Add `replayAttacks()` method**: Create a private method that iterates both boards' `gridState` arrays. For each cell with `CellState.Hit`, `CellState.Miss`, or `CellState.Sunk`, compute the `(x, z)` coordinates from the array index and fire `attackResultListeners` with the appropriate result string and `isPlayer` flag. Note: attacks on the player board were fired by the enemy (`isPlayer = false`), and attacks on the enemy board were fired by the player (`isPlayer = true`).

2. **Call `replayAttacks()` from `loadMatch()`**: After `replayShips(match)`, call `this.replayAttacks(match)` so attack markers are created after ships are in place.

3. **Add replay flag to `onAttackResult` callback signature**: Extend `AttackResultListener` to accept an optional `isReplay?: boolean` parameter so `EntityManager` can distinguish replay from live attacks.

**File**: `src/presentation/3d/entities/EntityManager.ts`

**Function**: `addAttackMarker()`

**Specific Changes**:
4. **Support instant marker placement**: Add an optional `isReplay: boolean = false` parameter. When `isReplay` is true, place the marker directly at its final position with the final color material applied, skipping the parabolic arc animation and the `fallingMarkers` queue entirely.

5. **Handle sunk ship visuals on replay**: When replaying a `sunk` result, ensure the marker is placed and the ship group's sinking visual state is applied (if applicable).

**File**: `src/main.ts`

**Specific Changes**:
6. **Pass replay flag through event wiring**: Update the `onAttackResult` listener registration to forward the `isReplay` parameter from `GameLoop` to `EntityManager.addAttackMarker()`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Create a Match with known attack history (manually set `gridState` cells to Hit/Miss/Sunk), call `loadMatch()`, and assert that `attackResultListeners` were invoked. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Single Hit Replay Test**: Create a match with one `CellState.Hit` cell on the enemy board at (3, 4). Call `loadMatch()`. Assert `attackResultListeners` was called with `(3, 4, 'hit', true)` (will fail on unfixed code).
2. **Multiple Attack Types Test**: Create a match with Hit, Miss, and Sunk cells across both boards. Call `loadMatch()`. Assert all expected callbacks fire (will fail on unfixed code).
3. **Sunk Ship Full Replay Test**: Create a match with a 3-cell ship fully sunk. Call `loadMatch()`. Assert three `sunk` callbacks fire for the ship's coordinates (will fail on unfixed code).
4. **Empty Board Load Test**: Create a match with zero attacks. Call `loadMatch()`. Assert zero `attackResultListeners` calls (may pass on unfixed code — no bug condition).

**Expected Counterexamples**:
- `attackResultListeners` array is never iterated during `loadMatch()` — zero callbacks fire for any attack state
- Confirmed cause: `loadMatch()` only calls `replayShips()`, no attack replay exists

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL match WHERE isBugCondition({ match, action: 'load' }) DO
  callbackLog := []
  gameLoop.onAttackResult((x, z, result, isPlayer) => callbackLog.push({ x, z, result, isPlayer }))
  gameLoop.loadMatch(match)

  expectedAttacks := extractAttacksFromGridState(match.playerBoard, match.enemyBoard)
  ASSERT callbackLog EQUALS expectedAttacks (same coordinates, results, and isPlayer flags)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL action WHERE NOT isBugCondition(action) DO
  ASSERT originalBehavior(action) = fixedBehavior(action)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for new game starts, live attacks, and save operations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **New Game Flow Preservation**: Verify that `startNewMatch()` does not invoke `replayAttacks()` — only the existing placement flow runs
2. **Live Attack Animation Preservation**: Verify that `onGridClick()` and `handleEnemyTurn()` still fire `onAttackResult` with `isReplay = false`, causing animated arc markers
3. **Save Format Preservation**: Verify that `Storage.saveGame()` output is byte-identical before and after the fix
4. **Minimap Rendering Preservation**: Verify that `UnifiedBoardUI.refresh()` continues to read from `Board.gridState` and renders correctly after both new game and load

### Unit Tests

- Test `replayAttacks()` with a board containing known Hit, Miss, and Sunk cells — verify correct callbacks
- Test `replayAttacks()` with an empty board (no attacks) — verify zero callbacks
- Test `replayAttacks()` correctly maps array index to `(x, z)` coordinates: `x = index % width`, `z = Math.floor(index / width)`
- Test `replayAttacks()` sets correct `isPlayer` flag: attacks on enemy board → `isPlayer = true`, attacks on player board → `isPlayer = false`
- Test `addAttackMarker()` with `isReplay = true` places marker instantly at final position without arc animation
- Test `addAttackMarker()` with `isReplay = false` (default) still creates parabolic arc animation

### Property-Based Tests

- Generate random board states with arbitrary attack patterns (0–100 cells with Hit/Miss/Sunk) and verify `replayAttacks()` fires exactly the right number of callbacks with correct coordinates and result types
- Generate random board states and verify that the set of replayed `(x, z, result)` tuples matches exactly the non-Empty, non-Ship cells in `gridState`
- Generate random matches and verify that `startNewMatch()` never triggers attack replay callbacks

### Integration Tests

- Full save-load round trip: start a game, make several attacks, save, load, verify 3D markers match minimap state
- Load a game with a fully sunk ship and verify both sunk markers and ship damage visuals appear
- Load a game and continue playing — verify new live attacks still animate with arcs on top of the instantly-placed replay markers