# Bugfix Requirements Document

## Introduction

When loading a saved game, the 3D battlefield renders an empty board — no ships, attack markers (hits, misses, sinks) are visible. However, the minimap (UnifiedBoardUI) displays all state correctly because it reads directly from `Board.gridState`. The root cause is that `GameLoop.loadMatch()` only replays ship placement events via `replayShips()` but never replays attack results. The 3D `EntityManager` relies entirely on event callbacks (`onShipPlaced`, `onAttackResult`) to create meshes, so without attack replay events, the 3D scene is incomplete after load.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a saved game is loaded that contains attack history (hits, misses, sinks) THEN the system does not fire `onAttackResult` callbacks, resulting in no attack markers rendered on the 3D battlefield

1.2 WHEN a saved game is loaded that contains placed ships with hit or sunk segments THEN the system renders the ships in their undamaged state on the 3D board (no visual damage indicators on hit/sunk ship segments)

1.3 WHEN a saved game is loaded THEN the 3D battlefield and the minimap display inconsistent state — the minimap shows all hits, misses, and sinks correctly while the 3D board appears empty of attack markers

### Expected Behavior (Correct)

2.1 WHEN a saved game is loaded that contains attack history (hits, misses, sinks) THEN the system SHALL replay all attack results so that hit, miss, and sunk markers appear on the 3D battlefield at their correct grid positions

2.2 WHEN a saved game is loaded that contains placed ships with hit or sunk segments THEN the system SHALL render ships with appropriate visual damage state reflecting their hit/sunk segments

2.3 WHEN a saved game is loaded THEN the 3D battlefield and the minimap SHALL display consistent state — both showing the same ships, hits, misses, and sinks

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a new game is started (not loaded from save) THEN the system SHALL CONTINUE TO place ships and process attacks via the existing event-driven flow without any change in behavior

3.2 WHEN a game is saved THEN the system SHALL CONTINUE TO serialize the full match state (both boards' gridState, ships with segment damage, shotsFired, hits) identically to the current implementation

3.3 WHEN the minimap renders board state after a load THEN the system SHALL CONTINUE TO display correct state by reading from `Board.gridState` as it does today

3.4 WHEN attacks occur during normal gameplay (not during load replay) THEN the system SHALL CONTINUE TO animate attack markers with the parabolic arc trajectory and particle effects

3.5 WHEN a saved game is loaded THEN the system SHALL CONTINUE TO restore the camera position, board orientation, day/night mode, and game speed from the saved ViewState
