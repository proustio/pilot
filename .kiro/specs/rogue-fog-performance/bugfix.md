# Bugfix Requirements Document

## Introduction

Rogue mode (20×20 board) runs at ~7-11 FPS with 213 draw calls and 583,908 triangles. Two root causes have been identified:

**Phase 1 (Complete):** `FogManager.updateRogueFog()` ran unconditionally every frame, iterating all 400 cells × all ship segments. Fixed via dirty flag + opacity snap. Result: reduced CPU-side waste but FPS unchanged — confirming the bottleneck is GPU-side, not CPU-side.

**Phase 2 (Current):** The fog system creates a separate `InstancedMesh` (250 voxels each) per fogged cell, producing ~150+ draw calls and ~450K triangles from fog alone. Each mesh has a cloned material with `onBeforeCompile`, preventing GPU batching. Ship wireframe overlays double draw calls per ship. This is the actual GPU bottleneck.

## Bug Analysis

### Current Behavior (Defect)

#### Phase 1 — CPU-Side Waste (FIXED)

1.1 ~~WHEN `VesselVisibilityManager.update()` is called each frame THEN the system invokes `FogManager.updateRogueFog()` unconditionally, iterating all 400 board cells and all ship segments every frame with no dirty-checking, even when no game state has changed since the previous frame~~ **[FIXED — dirty flag guard added]**

1.2 ~~WHEN fog opacity is updated in `updateRogueFog()` THEN the system lerps material opacity every frame for every fogged cell (`mat.opacity += (targetOpacity - mat.opacity) * activeLerp`), requiring multiple consecutive frames to converge and making the per-frame call path load-bearing for visual correctness~~ **[FIXED — opacity snap implemented]**

1.3 ~~WHEN all fog rendering overhead is combined in Rogue mode THEN the system produces excessive frame times due to the O(cells × shipSegments) computation running ~60 times per second, contributing significantly to the observed 11 FPS on a 20×20 board~~ **[FIXED — computation now event-driven]**

#### Phase 2 — GPU-Side Bottleneck (Current)

1.4 WHEN fog cells are created in Rogue mode THEN the system creates a separate `InstancedMesh` (250 voxels) per fogged cell via `new THREE.InstancedMesh(this.fogGeo, clonedMat, numVoxels)`, producing one draw call per fogged cell (~150+ draw calls from fog alone on a typical 20×20 board)

1.5 WHEN a new fog cell mesh is instantiated THEN the system clones the fog material prototype via `this.fogMatProto.clone()` and copies `onBeforeCompile` onto each clone, creating ~150+ unique material instances that prevent the GPU from batching fog draw calls together

1.6 WHEN fog voxels are rendered THEN the system uses 250 voxels per fog cell across ~150 fogged cells, producing ~37,500 fog voxel instances at 12 triangles each = ~450,000 triangles from fog alone, far exceeding the <100 draw call performance target

1.7 WHEN ships are rendered in Rogue mode THEN `ShipFactory.createShip()` creates a second `InstancedMesh` (`instancedLines`) as a wireframe neon overlay for each ship, doubling the draw calls per ship and adding unnecessary GPU load

### Expected Behavior (Correct)

#### Phase 1 — CPU-Side Waste (IMPLEMENTED)

2.1 ~~WHEN `VesselVisibilityManager.update()` is called each frame and no fog-dirty event has occurred since the last recalculation THEN the system SHALL skip the `updateRogueFog()` computation entirely via a dirty flag early-return, performing zero cell iteration on clean frames~~ **[IMPLEMENTED]**

2.2 ~~WHEN fog opacity is updated in `updateRogueFog()` after a dirty event THEN the system SHALL snap material opacity directly to the target value (`mat.opacity = targetOpacity`) instead of lerping, so that fog state is visually correct after a single recalculation pass~~ **[IMPLEMENTED]**

2.3 ~~WHEN a fog-relevant event occurs (ship move, attack, skip, turn change, setup phase change, temporary/permanent cell reveal) THEN the system SHALL mark fog as dirty so that the next `updateRogueFog()` call executes the full cell iteration exactly once, then clears the dirty flag~~ **[IMPLEMENTED]**

#### Phase 2 — GPU-Side Bottleneck (Current)

2.4 WHEN Rogue mode fog is rendered THEN the system SHALL consolidate all fog voxels into a single large `InstancedMesh` (or at most 2 — one per board side), replacing the per-cell mesh architecture, so that all fog is drawn in 1-2 draw calls instead of ~150+

2.5 WHEN Rogue mode fog is rendered THEN the system SHALL share a single fog material instance across all fog voxels, eliminating per-cell `fogMatProto.clone()` and enabling GPU batching

2.6 WHEN Rogue mode fog voxels are generated THEN the system SHALL reduce the voxel count per fog cell from 250 to ~50-80, reducing total fog triangle count from ~450K to ~60-100K while maintaining visual density

2.7 WHEN ships are rendered in Rogue mode THEN the system SHALL remove or merge the wireframe overlay `InstancedMesh` (`instancedLines`) to eliminate the doubled draw calls per ship

2.8 WHEN all Phase 2 optimizations are applied THEN the system SHALL achieve fewer than 100 total draw calls and 30+ FPS in Rogue mode on a 20×20 board

### Unchanged Behavior (Regression Prevention)

3.1 WHEN Classic or Russian mode is active (10×10 board, `rogueMode === false`) THEN the system SHALL CONTINUE TO render static per-cell fog meshes with the existing material and draw call behavior, as these modes already perform within targets

3.2 WHEN fog cells are revealed (temporarily or permanently) in Rogue mode THEN the system SHALL CONTINUE TO correctly show/hide fog based on ship vision radius, temporary reveals from attacks, permanent reveals from sunk ships, and setup-phase quadrant visibility

3.3 WHEN fog is animated (bobbing, rotation via vertex shader) THEN the system SHALL CONTINUE TO display smooth fog voxel animation driven by the `uFogTime` uniform in `updateAnimation()`, which remains a per-frame call independent of fog recalculation

3.4 WHEN ships are rendered in any mode THEN the system SHALL CONTINUE TO display correct voxel hull geometry, per-instance coloring, turrets, and accent highlights with no visual regression

3.5 WHEN `FogManager.isCellRevealed()` is queried for game logic (enemy ship visibility, attack targeting) THEN the system SHALL CONTINUE TO return correct revealed/hidden status for all cells based on ship proximity, temporary reveals, permanent reveals, and setup phase rules

3.6 WHEN a match is reset via `FogManager.reset()` THEN the system SHALL CONTINUE TO properly dispose of all fog meshes and reinitialize fog state cleanly for the next match
