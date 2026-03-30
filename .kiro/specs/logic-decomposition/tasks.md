# Tasks: Logic Decomposition

## Task 1: Decompose TurnExecutor (AC: 1)
- [x] 1.1 Create `src/application/game-loop/EnemyTurnHandler.ts` — extract `handleEnemyTurn()` logic (Classic + Rogue AI turn execution) from `TurnExecutor.ts`, accepting `TurnExecutorState` via constructor
- [x] 1.2 Create `src/application/game-loop/SetupBoardHandler.ts` — extract `onSetupBoardClick()` logic (ship placement during SETUP_BOARD phase) from `TurnExecutor.ts`, accepting `TurnExecutorState` via constructor
- [x] 1.3 Update `TurnExecutor.ts` to instantiate and delegate to `EnemyTurnHandler` and `SetupBoardHandler`, retaining `onPlayerTurnClick()` and `handleAutoPlayerTurn()`
- [x] 1.4 Verify `GameLoop.preservation.test.ts` and `GameLoop.replayAttacks.test.ts` pass unchanged

## Task 2: Decompose AIEngine (AC: 2)
- [x] 2.1 Create `src/application/ai/AIMovement.ts` — extract `decideAction()`, `computeMove()`, `findVisibleEnemyInRange()`, and `getDistance()` from `AIEngine.ts`
- [x] 2.2 Create `src/application/ai/AITargeting.ts` — extract `computeNextMove()`, `computeEasyMove()`, `computeNormalMove()`, `computeHardMove()`, and `canFitShipExperimentally()` from `AIEngine.ts`
- [x] 2.3 Update `AIEngine.ts` to instantiate and delegate to `AIMovement` and `AITargeting`, retaining difficulty config, `reportResult()`, and hunt stack management
- [x] 2.4 Verify `AIEngine.movement.test.ts` and `AIEngine.strategy.test.ts` pass unchanged

## Task 3: Decompose Board (AC: 3, 4)
- [x] 3.1 Create `src/domain/board/WeaponSystem.ts` — extract `placeMine()`, `placeSonar()`, `sonarPing()`, and `dispatchAirStrike()` from `Board.ts`, operating on a `Board` instance parameter
- [x] 3.2 Create `src/domain/board/ShipPlacement.ts` — extract `canPlaceShip()`, `placeShip()`, `removeShip()`, and `moveShip()` from `Board.ts`, operating on a `Board` instance parameter
- [x] 3.3 Update `Board.ts` to delegate to `WeaponSystem` and `ShipPlacement`, retaining core grid state, `receiveAttack()`, `getShipAt()`, and `allShipsSunk()`
- [x] 3.4 Verify `WeaponSystem.ts` and `ShipPlacement.ts` have zero imports from `presentation/` or `infrastructure/`
- [x] 3.5 Verify `Board.test.ts` and `Board.benchmark.test.ts` pass unchanged

## Task 4: Decompose EntityManager (AC: 5)
- [x] 4.1 Create `src/presentation/3d/entities/ShipAnimator.ts` — extract `updateShipAnimations()`, `updateShipHighlighting()`, and `updatePlacementHighlight()` from `EntityManager.ts`
- [x] 4.2 Update `EntityManager.ts` to instantiate and delegate to `ShipAnimator` in the `update()` loop

## Task 5: Decompose BoardBuilder (AC: 6)
- [x] 5.1 Create `src/presentation/3d/entities/BoardMeshFactory.ts` — extract frame, base, brackets, rivets, screws, and bottom plane creation from `BoardBuilder.build()`
- [x] 5.2 Create `src/presentation/3d/entities/FogMeshFactory.ts` — extract fog voxel geometry creation, fog material setup, shader injection, and consolidated fog initialization from `BoardBuilder.build()`
- [x] 5.3 Update `BoardBuilder.ts` to call `BoardMeshFactory` and `FogMeshFactory`, retaining water plane, grid tile, raycast plane creation, and theme listener setup

## Task 6: Decompose FogManager (AC: 7)
- [x] 6.1 Create `src/presentation/3d/entities/FogVisibility.ts` — extract temporary/permanent reveal tracking, `isCellRevealed()`, `revealCellTemporarily()`, `revealCellPermanently()`, `onTurnChange()` reveal decrement, and vision radius queries
- [x] 6.2 Update `FogManager.ts` to instantiate and delegate visibility queries to `FogVisibility`, retaining fog mesh lifecycle, consolidated mesh updates, and animation
- [x] 6.3 Verify all `FogManager.*.test.ts` tests pass unchanged

## Task 7: Decompose ShipFactory (AC: 8)
- [x] 7.1 Create `src/presentation/3d/entities/ShipVoxelBuilder.ts` — extract hull shape computation (`getHullWidth`, `getBridgeHeight`), voxel data generation loop, and color assignment logic from `ShipFactory.createShip()`
- [x] 7.2 Update `ShipFactory.ts` to call `ShipVoxelBuilder` for voxel data, retaining ship group assembly, instanced mesh creation, turret addition, and mine/sonar model creation

## Task 8: Decompose ParticleSystem (AC: 9)
- [x] 8.1 Create `src/presentation/3d/entities/EmitterManager.ts` — extract `Emitter` interface, emitter array, `addEmitter()`, `updateEmittersByIdPrefix()`, and emitter spawn scheduling loop from `ParticleSystem.update()`
- [x] 8.2 Update `ParticleSystem.ts` to instantiate and delegate emitter management to `EmitterManager`, retaining particle spawning methods and particle update loop

## Task 9: Decompose ImpactEffects (AC: 10)
- [x] 9.1 Create `src/presentation/3d/entities/SinkingEffects.ts` — extract `handleSinking()` and `splitShipForBreaking()` from `ImpactEffects.ts`
- [x] 9.2 Update `ImpactEffects.ts` to instantiate and delegate sinking logic to `SinkingEffects`, retaining `applyImpactEffects()` entry point and `addPersistentFireToShipCell()`

## Task 10: Decompose ProjectileManager (AC: 11)
- [x] 10.1 Create `src/presentation/3d/entities/ProjectileAnimator.ts` — extract `updateProjectiles()` arc animation, landing resolution, fog clearing, and sound trigger logic from `ProjectileManager.ts`
- [x] 10.2 Update `ProjectileManager.ts` to instantiate and delegate to `ProjectileAnimator`, retaining `addAttackMarker()`, `hasFallingMarkers()`, and `clear()`

## Task 11: Decompose InteractionManager (AC: 12)
- [x] 11.1 Create `src/presentation/3d/interaction/ClickHandler.ts` — extract `onMouseClick()` logic (intersection resolution, cell validation, error sound, click listener dispatch) from `InteractionManager.ts`
- [x] 11.2 Update `InteractionManager.ts` to instantiate and delegate click handling to `ClickHandler`, retaining hover updates, highlight methods, and event setup

## Task 12: Decompose InputFeedbackHandler (AC: 13)
- [x] 12.1 Create `src/presentation/3d/interaction/RangeHighlighter.ts` — extract `rebuildMoveHighlight()` and `rebuildRangeHighlights()` from `InputFeedbackHandler.ts`
- [x] 12.2 Update `InputFeedbackHandler.ts` to instantiate and delegate range highlighting to `RangeHighlighter`, retaining hover cursor, ghost preview, and tornado animation

## Task 13: Final Verification (AC: 14, 15, 16, 17)
- [x] 13.1 Verify all decomposed files are under 400 lines and each exports exactly one class named after the file
- [~] 13.2 Verify no extracted helper imports its parent coordinator (no circular dependencies)
- [~] 13.3 Run full test suite — all existing tests must pass without modification
- [~] 13.4 Verify no new `document.dispatchEvent` calls exist — only `GameEventBus` for cross-layer communication
