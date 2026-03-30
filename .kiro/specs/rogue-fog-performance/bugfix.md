# Bugfix Requirements Document

## Introduction

Rogue mode (20×20 board) suffers from poor frame rates because `FogManager.updateRogueFog()` runs unconditionally every frame via `VesselVisibilityManager.update()`, iterating all 400 board cells × all ship segments and lerping material opacity ~60 times per second even when no game state has changed. This fix is scoped to a single change: move fog recalculation from per-frame to event-driven using a dirty flag, and snap fog opacity instead of lerping.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `VesselVisibilityManager.update()` is called each frame THEN the system invokes `FogManager.updateRogueFog()` unconditionally, iterating all 400 board cells and all ship segments every frame with no dirty-checking, even when no game state has changed since the previous frame

1.2 WHEN fog opacity is updated in `updateRogueFog()` THEN the system lerps material opacity every frame for every fogged cell (`mat.opacity += (targetOpacity - mat.opacity) * activeLerp`), requiring multiple consecutive frames to converge and making the per-frame call path load-bearing for visual correctness

1.3 WHEN all fog rendering overhead is combined in Rogue mode THEN the system produces excessive frame times due to the O(cells × shipSegments) computation running ~60 times per second, contributing significantly to the observed 11 FPS on a 20×20 board

### Expected Behavior (Correct)

2.1 WHEN `VesselVisibilityManager.update()` is called each frame and no fog-dirty event has occurred since the last recalculation THEN the system SHALL skip the `updateRogueFog()` computation entirely via a dirty flag early-return, performing zero cell iteration on clean frames

2.2 WHEN fog opacity is updated in `updateRogueFog()` after a dirty event THEN the system SHALL snap material opacity directly to the target value (`mat.opacity = targetOpacity`) instead of lerping, so that fog state is visually correct after a single recalculation pass

2.3 WHEN a fog-relevant event occurs (ship move, attack, skip, turn change, setup phase change, temporary/permanent cell reveal) THEN the system SHALL mark fog as dirty so that the next `updateRogueFog()` call executes the full cell iteration exactly once, then clears the dirty flag

### Unchanged Behavior (Regression Prevention)

3.1 WHEN Classic or Russian mode is active (10×10 board, `rogueMode === false`) THEN the system SHALL CONTINUE TO render static per-cell fog meshes with the existing material and draw call behavior, as these modes already perform within targets

3.2 WHEN fog cells are revealed (temporarily or permanently) in Rogue mode THEN the system SHALL CONTINUE TO correctly show/hide fog based on ship vision radius, temporary reveals from attacks, permanent reveals from sunk ships, and setup-phase quadrant visibility

3.3 WHEN fog is animated (bobbing, rotation via vertex shader) THEN the system SHALL CONTINUE TO display smooth fog voxel animation driven by the `uFogTime` uniform in `updateAnimation()`, which remains a per-frame call independent of fog recalculation

3.4 WHEN ships are rendered in any mode THEN the system SHALL CONTINUE TO display correct voxel hull geometry, per-instance coloring, turrets, accent highlights, and wireframe overlays with no visual regression

3.5 WHEN `FogManager.isCellRevealed()` is queried for game logic (enemy ship visibility, attack targeting) THEN the system SHALL CONTINUE TO return correct revealed/hidden status for all cells based on ship proximity, temporary reveals, permanent reveals, and setup phase rules

3.6 WHEN a match is reset via `FogManager.reset()` THEN the system SHALL CONTINUE TO properly dispose of all fog meshes and reinitialize fog state cleanly for the next match

3.7 WHEN per-cell fog meshes are created in Rogue mode THEN the system SHALL CONTINUE TO use the existing per-cell `InstancedMesh` architecture (one mesh per fogged cell, 250 voxels each) and per-cell material cloning, as these are explicitly out of scope for this fix
