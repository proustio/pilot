# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Attack Markers Not Restored on Load
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate `loadMatch()` never fires `attackResultListeners` for persisted attack state
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — a Match with known Hit/Miss/Sunk cells in `Board.gridState`
  - **Setup**: No test framework is configured. Install Vitest (`npm i -D vitest`) and add a `"test": "vitest --run"` script to `package.json`
  - **Test file**: `src/application/game-loop/__tests__/GameLoop.replayAttacks.test.ts`
  - Create a `Match` with both boards containing attack state: set `playerBoard.gridState` cells to `CellState.Hit` at (3,4), `CellState.Miss` at (7,2), and `enemyBoard.gridState` cells to `CellState.Sunk` at (1,1),(2,1),(3,1)
  - Register a spy on `gameLoop.onAttackResult()` to capture all callback invocations
  - Call `gameLoop.loadMatch(match)`
  - Assert the spy was called once per attack-state cell (5 total) with correct `(x, z, result, isPlayer)` tuples:
    - `(3, 4, 'hit', false)` — hit on player board means enemy fired, so `isPlayer = false`
    - `(7, 2, 'miss', false)` — miss on player board means enemy fired, so `isPlayer = false`
    - `(1, 1, 'sunk', true)`, `(2, 1, 'sunk', true)`, `(3, 1, 'sunk', true)` — sunk on enemy board means player fired, so `isPlayer = true`
  - Assert each callback received `isReplay = true` (the new 5th parameter)
  - Run test on UNFIXED code — expect FAILURE (confirms `loadMatch()` has no attack replay)
  - **EXPECTED OUTCOME**: Test FAILS — `attackResultListeners` is never invoked during `loadMatch()`, zero callbacks fire
  - Document counterexamples: "`loadMatch()` only calls `replayShips()`, no attack replay exists — 0 of 5 expected callbacks fired"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Load Gameplay Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test file**: `src/application/game-loop/__tests__/GameLoop.preservation.test.ts`
  - **Observe on UNFIXED code first**, then write tests asserting observed behavior:
  - Observe: `startNewMatch(match)` fires `shipPlacedListeners` but never fires `attackResultListeners` — verify zero attack callbacks
  - Observe: `onGridClick(x, z)` during `PLAYER_TURN` fires `attackResultListeners` with `(x, z, result, true)` and no `isReplay` parameter (or `isReplay = false`/`undefined`)
  - Observe: `handleEnemyTurn()` fires `attackResultListeners` with `(x, z, result, false)` and no `isReplay` parameter
  - Write property-based test: for any new match started via `startNewMatch()`, the number of `attackResultListeners` invocations is exactly 0
  - Write property-based test: for any live attack via `onGridClick()` on a valid cell during `PLAYER_TURN`, the callback is invoked with `isReplay` being `false` or `undefined` (not `true`)
  - Write test: `AttackResultListener` type signature is backward-compatible — existing 4-parameter callbacks `(x, z, result, isPlayer)` still work when a 5th `isReplay` parameter is added
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.4_

- [ ] 3. Implement attack replay on load

  - [ ] 3.1 Extend `AttackResultListener` type to accept optional `isReplay` parameter
    - In `src/application/game-loop/GameLoop.ts`, change the type alias:
    - `type AttackResultListener = (x: number, z: number, result: string, isPlayer: boolean, isReplay?: boolean) => void;`
    - The optional 5th parameter ensures backward compatibility — existing 4-arg callbacks still work
    - _Bug_Condition: isBugCondition(input) where input.action == 'load' AND boards contain Hit/Miss/Sunk cells_
    - _Expected_Behavior: replay callbacks include isReplay=true so presentation layer can distinguish replay from live_
    - _Preservation: existing 4-parameter callbacks continue to work unchanged_
    - _Requirements: 2.1, 3.1, 3.4_

  - [ ] 3.2 Add `replayAttacks()` method to `GameLoop`
    - In `src/application/game-loop/GameLoop.ts`, add a private method after `replayShips()`:
    - Import `CellState` from `../../domain/board/Board`
    - Iterate `match.playerBoard.gridState` — for each cell with `CellState.Hit`, `CellState.Miss`, or `CellState.Sunk`:
      - Compute `x = index % board.width`, `z = Math.floor(index / board.width)`
      - Map `CellState.Hit` → `'hit'`, `CellState.Miss` → `'miss'`, `CellState.Sunk` → `'sunk'`
      - Fire `attackResultListeners` with `(x, z, result, false, true)` — `isPlayer=false` because attacks on player board were fired by enemy, `isReplay=true`
    - Iterate `match.enemyBoard.gridState` — same logic but fire with `isPlayer=true` (player fired these attacks)
    - _Bug_Condition: loadMatch() calls replayShips() but has no replayAttacks() — zero attack callbacks fire_
    - _Expected_Behavior: replayAttacks() fires one callback per Hit/Miss/Sunk cell with correct (x, z, result, isPlayer, isReplay=true)_
    - _Preservation: replayAttacks() is only called from loadMatch(), never from startNewMatch() or live gameplay_
    - _Requirements: 1.1, 2.1, 2.3_

  - [ ] 3.3 Call `replayAttacks()` from `loadMatch()`
    - In `GameLoop.loadMatch()`, add `this.replayAttacks(match)` after `this.replayShips(match)` and before `this.transitionTo()`
    - Order matters: ships must exist before attack markers reference them
    - _Bug_Condition: loadMatch() only calls replayShips(), missing replayAttacks()_
    - _Expected_Behavior: loadMatch() now calls replayShips() then replayAttacks() then transitionTo()_
    - _Requirements: 2.1, 2.3_

  - [ ] 3.4 Add instant placement support to `EntityManager.addAttackMarker()`
    - In `src/presentation/3d/entities/EntityManager.ts`, add optional `isReplay: boolean = false` parameter to `addAttackMarker()`
    - When `isReplay` is `true`:
      - Create the rocket marker mesh group with the final `originalMat` material (not `activeMat`)
      - Place marker directly at final position `(worldX, 0.4, worldZ)` in the target board group
      - Skip the parabolic arc animation — do NOT push to `this.fallingMarkers` queue
      - Skip ripple/turbulence effects
    - When `isReplay` is `false` (default): existing behavior unchanged — parabolic arc animation, activeMat, fallingMarkers queue
    - Handle sunk result on replay: place sunk marker at position (sinking ship visual is handled by the marker color)
    - _Bug_Condition: addAttackMarker() always animates with parabolic arc, no instant placement path exists_
    - _Expected_Behavior: isReplay=true places marker instantly at final position with correct color, no animation_
    - _Preservation: isReplay=false (default) preserves existing animated arc behavior for live gameplay_
    - _Requirements: 2.1, 2.2, 3.4_

  - [ ] 3.5 Update `main.ts` event wiring to forward `isReplay` parameter
    - In `src/main.ts`, update the `gameLoop.onAttackResult` callback to pass through the 5th parameter:
    - Change: `gameLoop.onAttackResult((x, z, result, isPlayer) => { entityManager.addAttackMarker(x, z, result, isPlayer); });`
    - To: `gameLoop.onAttackResult((x, z, result, isPlayer, isReplay) => { entityManager.addAttackMarker(x, z, result, isPlayer, isReplay); });`
    - This bridges the application layer's replay flag to the presentation layer's instant placement
    - _Bug_Condition: main.ts wiring drops the isReplay parameter, so EntityManager never receives it_
    - _Expected_Behavior: isReplay flag flows from GameLoop through main.ts to EntityManager_
    - _Preservation: when isReplay is undefined/false, addAttackMarker() uses default animated behavior_
    - _Requirements: 2.1, 3.4_

  - [ ] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Attack Markers Restored on Load
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (correct callbacks with correct arguments)
    - When this test passes, it confirms `loadMatch()` now replays all attack state
    - Run: `npx vitest --run src/application/game-loop/__tests__/GameLoop.replayAttacks.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — all 5 attack callbacks fire with correct coordinates, results, isPlayer flags, and isReplay=true)
    - _Requirements: 2.1, 2.3_

  - [ ] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Load Gameplay Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `npx vitest --run src/application/game-loop/__tests__/GameLoop.preservation.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — startNewMatch still fires zero attack callbacks, live attacks still use isReplay=false/undefined)
    - Confirm all preservation tests still pass after fix

- [ ] 4. Checkpoint — Ensure all tests pass
  - Run full test suite: `npx vitest --run`
  - Verify all bug condition and preservation tests pass
  - Run `npm run build` to confirm TypeScript compilation succeeds with no errors
  - Ensure all tests pass, ask the user if questions arise
