# Implementation Plan: Rogue Movement & Collision

## Overview

Incremental implementation of the PathResolver-based movement pipeline, ramming mechanics, doubled movement range, static/dead entity guards, and presentation-layer polish (normalized animation, water ripples, ramming effects). Domain logic first, then application wiring, then presentation.

## Tasks

- [ ] 1. Config timing additions and Ship.maxMoves refactor
  - [ ] 1.1 Add `rogueMoveDurationMs` and `rogueTurnDurationMs` to `Config.timing`
    - Add `rogueMoveDurationMs: 600` and `rogueTurnDurationMs: 400` to the `timing` object in `src/infrastructure/config/Config.ts`
    - _Requirements: 1.3, 7.1, 7.2_

  - [ ] 1.2 Refactor `Ship.maxMoves` from `readonly` to getter/setter with doubled formula
    - Replace `public readonly maxMoves: number` with a private `_maxMoves` backing field
    - Add `get maxMoves()` / `set maxMoves(value)` accessors
    - Change constructor formula to `Math.max(0, 5 - this.size) * 2`
    - Verify `resetTurnAction()` still reads the new `maxMoves` correctly
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 1.3 Write property tests for Ship.maxMoves (Property 2)
    - **Property 2: maxMoves doubled formula and reset**
    - Use fast-check to generate ships with size in [1..5], assert `maxMoves === Math.max(0, 5 - size) * 2` and `resetTurnAction()` sets `movesRemaining === maxMoves`
    - Add to `src/domain/fleet/Ship.test.ts`
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 1.4 Write property tests for move cost ratios (Property 3)
    - **Property 3: Move cost ratios preserved**
    - Use fast-check to generate ship orientations and target cells, assert forward=0.5×dist, lateral=1×dist, backward=2×dist
    - Add to `src/domain/fleet/Ship.test.ts`
    - **Validates: Requirements 2.3**

- [ ] 2. Implement PathResolver domain class
  - [ ] 2.1 Create `src/domain/board/PathResolver.ts` with `PathCell`, `PathResult` interfaces and `PathResolver` class
    - Implement `computeCellPath(fromX, fromZ, toX, toZ)` — axis-aligned stepping (primary axis first, then secondary)
    - Implement `isCellBlocked(board, x, z, movingShip)` — checks for ships, Sunk cells, ignores moving ship's own cells
    - Implement `resolve(board, ship, targetX, targetZ, newOrientation)` — walks cell-by-cell, checks bounds, mines, blocked cells, returns `PathResult`
    - Read board dimensions from `board.width` / `board.height` (Config-driven via Board constructor)
    - _Requirements: 1.1, 1.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 2.2 Write property test for path bounds (Property 1)
    - **Property 1: Path stays within bounds**
    - Generate arbitrary boards and ship positions, assert all path cells satisfy `0 <= x < W` and `0 <= z < H`
    - Add to `src/domain/board/__tests__/PathResolver.test.ts`
    - **Validates: Requirements 1.5**

  - [ ]* 2.3 Write property test for path adjacency (Property 4)
    - **Property 4: Path adjacency and ordering**
    - Assert consecutive cells differ by exactly 1 in x or z (never both), first cell adjacent to start, last cell is target or stop point
    - Add to `src/domain/board/__tests__/PathResolver.test.ts`
    - **Validates: Requirements 3.1**

  - [ ]* 2.4 Write property test for mine detonation (Property 5)
    - **Property 5: Mine detonation stops ship and applies damage**
    - Generate boards with mines along path, assert path terminates at first mine, both mine and ship segments are hit
    - Add to `src/domain/board/__tests__/PathResolver.test.ts`
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 2.5 Write property test for impassable cells (Property 6)
    - **Property 6: Impassable cells block path**
    - Generate boards with blocking ships/Sunk cells, assert path stops before first impassable cell
    - Add to `src/domain/board/__tests__/PathResolver.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [ ]* 2.6 Write property test for ramming damage (Property 8)
    - **Property 8: Ramming inflicts damage to both ships**
    - Generate scenarios where path intersects another ship, assert `rammed === true`, front segment of rammer hit, nearest segment of rammed ship hit
    - Add to `src/domain/board/__tests__/PathResolver.test.ts`
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 2.7 Write property test for ramming rotation (Property 9)
    - **Property 9: Ramming rotates the rammer 90 degrees**
    - Assert ramming ship's final orientation is 90° from pre-move orientation (Horizontal↔Vertical, Left↔Up)
    - Add to `src/domain/board/__tests__/PathResolver.test.ts`
    - **Validates: Requirements 6.4**

  - [ ]* 2.8 Write property test for ramming stop position (Property 10)
    - **Property 10: Ramming stops ship adjacent to target**
    - Assert rammer's final position is the last unoccupied cell before the collision cell, adjacent to the rammed ship
    - Add to `src/domain/board/__tests__/PathResolver.test.ts`
    - **Validates: Requirements 6.5**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Add GameEventBus events and refactor RogueActionHandler
  - [ ] 4.1 Add `ROGUE_SHIP_RAMMED` and `ROGUE_PATH_MOVE` event types and payloads to `GameEventBus.ts`
    - Add enum entries and typed payloads as specified in the design
    - Import `PathCell` type from PathResolver
    - _Requirements: 6.1, 7.1, 8.1, 9.1_

  - [ ] 4.2 Refactor `RogueActionHandler.handleAttemptMove` to use PathResolver
    - Add static/dead entity guard: reject moves when `ship.isSunk()` or `ship.isSpecialWeapon`
    - Replace direct `sharedBoard.moveShip()` with `PathResolver.resolve()` + apply results to board
    - On ramming: inflict damage to both ships, rotate rammer 90°, set `movesRemaining=0` and `hasActedThisTurn=true`, emit `ROGUE_SHIP_RAMMED`
    - On mine hit: apply damage via existing mine logic, stop ship
    - Emit `ROGUE_PATH_MOVE` with path, orientation, and `Config.timing.rogueMoveDurationMs` for animation
    - Scale animation duration by `Config.timing.gameSpeedMultiplier`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 4.1, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 4.3 Add static/dead entity guard to `AIMovement.computeMove`
    - Skip movement for ships where `isSunk()` or `isSpecialWeapon` is true
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 4.4 Write property test for static/dead entity immobility (Property 7)
    - **Property 7: Static and dead entity immobility**
    - Generate sunk ships and special weapons, assert move attempts produce empty path and no state change
    - Add to `src/application/game-loop/__tests__/RogueActionHandler.movement.test.ts`
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 4.5 Write property test for ramming exhausts movement (Property 11)
    - **Property 11: Ramming exhausts movement**
    - Assert after ramming: `movesRemaining === 0` and `hasActedThisTurn === true`
    - Add to `src/application/game-loop/__tests__/RogueActionHandler.movement.test.ts`
    - **Validates: Requirements 6.6**

  - [ ]* 4.6 Write property test for team-agnostic ramming (Property 12)
    - **Property 12: Ramming is team-agnostic**
    - Generate ramming scenarios with `isEnemy=true` and `isEnemy=false`, assert identical damage, rotation, and stopping behavior
    - Add to `src/application/game-loop/__tests__/RogueActionHandler.movement.test.ts`
    - **Validates: Requirements 6.7**

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement movement animation normalization
  - [ ] 6.1 Add `animateAlongPath` method to `ShipAnimator`
    - Accept ship group, path cells, final orientation, and duration in ms
    - Lerp through waypoints with fixed total duration (divide by cell count)
    - Slerp rotation blending over the same duration for orientation changes
    - No-op for zero-length paths
    - Listen for `ROGUE_PATH_MOVE` events to trigger animation
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 6.2 Wire `ROGUE_PATH_MOVE` listener in EntityManager or ShipAnimator initialization
    - On event, find the ship mesh in playerBoardGroup, call `animateAlongPath`
    - _Requirements: 7.1, 7.3_

- [ ] 7. Implement water ripple and ramming visual effects
  - [ ] 7.1 Add water ripple spawning along movement path
    - Listen for `ROGUE_PATH_MOVE` in the presentation layer (EntityManager or a new listener)
    - Schedule `WaterShaderManager.addRipple()` calls evenly spaced across the animation duration, one per path cell
    - Convert path cell coordinates to world-space using board offset
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 7.2 Add ramming collision effects
    - Listen for `ROGUE_SHIP_RAMMED` in the presentation layer
    - Spawn collision particle burst at contact point via `ImpactEffects` (reuse `spawnExplosion` with reduced intensity)
    - Add camera shake: short-duration sinusoidal offset on `Engine3D` camera position
    - Animate the rammer's 90° rotation smoothly over `Config.timing.rogueTurnDurationMs`
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code is TypeScript; domain classes have zero framework dependencies
