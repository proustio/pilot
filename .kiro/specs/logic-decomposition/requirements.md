# Requirements: Logic Decomposition

## Requirement 1: Application Layer Decomposition

### Description
Decompose oversized files in `src/application/` following the Delegation Pattern, extracting cohesive responsibilities into dedicated helper classes while preserving the coordinator's public API.

### Acceptance Criteria

1. `TurnExecutor.ts` is split: `EnemyTurnHandler.ts` handles enemy turn execution (Classic + Rogue), `SetupBoardHandler.ts` handles SETUP_BOARD click logic, and `TurnExecutor.ts` retains player turn click and auto-battler orchestration. All three files are under 300 lines. `GameLoop` tests pass unchanged.
2. `AIEngine.ts` is split: `AIMovement.ts` handles Rogue-mode movement decisions (`decideAction`, `computeMove`, `findVisibleEnemyInRange`), `AITargeting.ts` handles attack target selection (`computeNextMove`, easy/normal/hard strategies, `canFitShipExperimentally`), and `AIEngine.ts` retains coordination, difficulty config, and `reportResult`. All three files are under 300 lines. AI tests pass unchanged.

## Requirement 2: Domain Layer Decomposition

### Description
Decompose `Board.ts` in `src/domain/board/` by extracting weapon dispatch and ship placement logic into dedicated domain classes, maintaining zero framework dependencies.

### Acceptance Criteria

3. `Board.ts` is split: `WeaponSystem.ts` handles mine placement, sonar ping, and air strike dispatch. `ShipPlacement.ts` handles `canPlaceShip`, `placeShip`, `removeShip`, and `moveShip`. `Board.ts` retains core grid state, `receiveAttack`, and `allShipsSunk`. All files are under 300 lines. `Board.test.ts` and `Board.benchmark.test.ts` pass unchanged.
4. `WeaponSystem.ts` and `ShipPlacement.ts` have zero imports from `presentation/` or `infrastructure/` directories, preserving DDD layer boundaries.

## Requirement 3: Presentation Entities Decomposition

### Description
Decompose oversized entity classes in `src/presentation/3d/entities/` by extracting animation, mesh generation, and lifecycle management into focused helper classes.

### Acceptance Criteria

5. `EntityManager.ts` extracts `ShipAnimator.ts` (ship sinking descent, movement lerp, highlight pulsing). `EntityManager.ts` remains a pure orchestrator. Both files are under 400 lines.
6. `BoardBuilder.ts` is split: `BoardMeshFactory.ts` handles frame, base, brackets, rivets, and screws. `FogMeshFactory.ts` handles fog voxel geometry, materials, and shader setup. `BoardBuilder.ts` orchestrates factories and creates water/grid/raycast planes. All files are under 300 lines.
7. `FogManager.ts` extracts `FogVisibility.ts` (cell reveal state tracking, vision radius queries, `isCellRevealed`). `FogManager.ts` retains fog mesh lifecycle and consolidated mesh updates. Both files are under 300 lines. All `FogManager.*.test.ts` tests pass unchanged.
8. `ShipFactory.ts` extracts `ShipVoxelBuilder.ts` (hull shape computation, voxel data generation, color assignment). `ShipFactory.ts` retains ship group assembly, instanced mesh creation, turrets, and mine/sonar models. Both files are under 300 lines.
9. `ParticleSystem.ts` extracts `EmitterManager.ts` (emitter registration, ID-based lookup, spawn scheduling). `ParticleSystem.ts` retains particle spawning and update loop. Both files are under 300 lines.
10. `ImpactEffects.ts` extracts `SinkingEffects.ts` (ship sinking animation setup, hull splitting, per-cell fire during sink). `ImpactEffects.ts` retains impact entry point and voxel destruction. Both files are under 300 lines.
11. `ProjectileManager.ts` extracts `ProjectileAnimator.ts` (per-frame arc animation, landing resolution, fog clearing, sound triggers). `ProjectileManager.ts` retains projectile creation and marker management. Both files are under 300 lines.

## Requirement 4: Presentation Interaction Decomposition

### Description
Decompose oversized interaction classes in `src/presentation/3d/interaction/` by extracting click handling and range highlighting into dedicated helpers.

### Acceptance Criteria

12. `InteractionManager.ts` extracts `ClickHandler.ts` (mouse click resolution, cell validation, error sounds). `InteractionManager.ts` retains hover updates, highlight delegation, and event setup. Both files are under 300 lines.
13. `InputFeedbackHandler.ts` extracts `RangeHighlighter.ts` (move highlight, vision/attack range highlight mesh building). `InputFeedbackHandler.ts` retains hover cursor, ghost preview, and tornado animation. Both files are under 300 lines.

## Requirement 5: Architectural Invariants

### Description
All decompositions must preserve the project's architectural rules: one class per file, no circular dependencies, DDD layer boundaries, and exclusive use of GameEventBus for cross-layer communication.

### Acceptance Criteria

14. Every new file exports exactly one class, named after the file. No file in the decomposition scope exceeds 400 lines.
15. No extracted helper class imports its parent coordinator. No circular dependency chains exist between new and existing files.
16. All existing tests (`Board.test.ts`, `Board.benchmark.test.ts`, `AIEngine.movement.test.ts`, `AIEngine.strategy.test.ts`, `GameLoop.preservation.test.ts`, `GameLoop.replayAttacks.test.ts`, `FogManager.*.test.ts`, `Match.rules.test.ts`) pass without modification after all decompositions are complete.
17. No new `document.dispatchEvent` calls are introduced. Cross-layer communication continues to use `GameEventBus` exclusively.
