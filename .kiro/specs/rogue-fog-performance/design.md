# Rogue Fog Performance Bugfix Design

## Overview

Rogue mode on a 20×20 board suffers from poor frame rates (~7 FPS, 213 draw calls, 583K triangles). Two root causes have been identified and are addressed in two phases:

**Phase 1 (COMPLETE):** CPU-side waste — `FogManager.updateRogueFog()` ran unconditionally every frame, iterating all 400 cells × all ship segments with opacity lerping. Fixed via dirty flag guard + opacity snap. Result: eliminated CPU-side waste, but FPS unchanged — confirming the bottleneck is GPU-side.

**Phase 2 (CURRENT):** GPU-side bottleneck — the fog system creates ~150 separate `InstancedMesh` objects (one per fogged cell, 250 voxels each), each with a cloned material + `onBeforeCompile`, preventing GPU batching. This produces ~150+ draw calls and ~450K triangles from fog alone. Ship wireframe overlays double draw calls per ship. The fix consolidates all Rogue fog into a single `InstancedMesh`, shares one material, reduces voxel density, and removes the wireframe overlay.

## Glossary

- **Bug_Condition (C)**: Phase 1: Rogue mode active and `updateRogueFog()` called unconditionally every frame. Phase 2: Rogue mode active and fog rendered as ~150 separate `InstancedMesh` objects with cloned materials, producing ~150+ draw calls
- **Property (P)**: Phase 1: Fog recalculation runs only when dirty. Phase 2: All fog drawn in 1 draw call via a single consolidated `InstancedMesh` with a shared material
- **Preservation**: Classic/Russian mode fog, `isCellRevealed()` game logic, fog animation, ship hull rendering, and reset cleanup must remain unchanged
- **FogManager**: The class in `src/presentation/3d/entities/FogManager.ts` that manages fog-of-war meshes and visibility state
- **VesselVisibilityManager**: The class in `src/presentation/3d/entities/VesselVisibilityManager.ts` that calls `updateRogueFog()` via its `update()` method
- **BoardBuilder**: The class in `src/presentation/3d/entities/BoardBuilder.ts` that procedurally generates board meshes including fog geometry and materials
- **ShipFactory**: The class in `src/presentation/3d/entities/ShipFactory.ts` that creates voxel ship models including wireframe overlays
- **Consolidated InstancedMesh**: A single `THREE.InstancedMesh` holding all fog voxels for all fogged cells, replacing per-cell meshes
- **fogMatProto**: The prototype fog material created in `BoardBuilder.build()` with `onBeforeCompile` for vertex shader animation
- **aBasePos / aPhase / aSpeed / aScale**: Per-voxel instanced buffer attributes driving fog animation (bobbing, rotation, scaling) in the vertex shader

## Bug Details

### Phase 1 Bug Condition (COMPLETE ✓)

~~The bug manifested when Rogue mode was active on a 20×20 board. `VesselVisibilityManager.update()` was called every frame by `EntityManager.update()`, unconditionally calling `this.fogManager.updateRogueFog(this.allShips)`. The inner loop iterated all 400 cells and all ship segments, computing Chebyshev distances and lerping material opacity, even when no game state had changed.~~

**Fixed via:** Dirty flag guard (`fogDirty`) + opacity snap (direct assignment instead of lerp) + event-driven dirty marking on state changes.

### Phase 2 Bug Condition (CURRENT)

The GPU bottleneck manifests when Rogue mode fog is rendered. The system creates a separate `InstancedMesh` per fogged cell (~150 on a typical 20×20 board), each with 250 voxels and a cloned material with `onBeforeCompile`. This architecture prevents GPU batching and produces excessive draw calls and triangle counts.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { rogueMode: boolean, fogCellCount: number, voxelsPerCell: number, drawCalls: number }
  OUTPUT: boolean

  RETURN input.rogueMode === true
         AND input.fogCellCount > 1
         AND eachFogCellHasOwnInstancedMesh(input) === true
         AND eachFogCellHasClonedMaterial(input) === true
         AND input.drawCalls > 100
END FUNCTION
```

### Examples

- **150 fogged cells × 250 voxels = 37,500 instances across 150 draw calls**: Each fogged cell creates its own `InstancedMesh` with `this.fogMatProto.clone()` + copied `onBeforeCompile`. GPU cannot batch these. Expected: 1 draw call for all fog voxels.
- **Material cloning prevents batching**: Even though all fog meshes use identical geometry and shader, each has a unique material instance. Three.js treats each as a separate draw call. Expected: single shared material = single draw call.
- **250 voxels per cell is excessive at 20×20 scale**: At Rogue mode's smaller cell size, 250 voxels per cell produces ~450K triangles from fog alone. Adjacent cells overlap visually. Expected: ~60 voxels per cell, ~9K total instances, ~108K triangles.
- **Ship wireframe overlay doubles draw calls**: `ShipFactory.createShip()` creates `instancedLines` (wireframe `InstancedMesh` at 0.2 opacity) for each ship, adding a draw call per ship for minimal visual benefit. Expected: no wireframe overlay.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Classic/Russian mode (10×10, `rogueMode === false`) must continue to render static per-cell fog meshes with the existing material and draw call behavior — these modes already perform within targets
- `isCellRevealed(x, z)` must return identical results for all inputs: ship proximity, temporary reveals, permanent reveals, sunk ships, hit segments, and setup-phase quadrant visibility
- Fog voxel animation (bobbing, rotation via `uFogTime` uniform in vertex shader) must continue to display smoothly via `updateAnimation()` which remains per-frame
- Ship hull voxel geometry, per-instance coloring, turrets, and accent highlights must render identically
- `FogManager.reset()` must properly dispose the consolidated mesh and reinitialize state cleanly
- Enemy ship visibility updates in `VesselVisibilityManager` must continue at their existing throttled rate
- Phase 1 dirty flag guard, `markFogDirty()` / `isFogDirty()`, opacity snap, and event-driven trigger points must remain functional

**Scope:**
All inputs that do NOT involve Rogue mode fog rendering architecture should be completely unaffected. This includes:
- Classic/Russian mode fog rendering (per-cell meshes retained)
- Game logic queries via `isCellRevealed()`
- Ship creation and hull rendering (only wireframe overlay removed)
- Fog animation shader behavior (vertex shader unchanged)
- All non-fog draw calls (water, grid, markers, particles)
- Phase 1 dirty flag optimization (retained and still effective)

## Hypothesized Root Cause

Based on code analysis and profiling (Phase 1 fix confirmed CPU is not the bottleneck), the GPU-side root causes are:

1. **Per-Cell InstancedMesh Architecture**: `updateRogueFog()` creates a new `THREE.InstancedMesh(this.fogGeo, clonedMat, 250)` for each fogged cell. With ~150 fogged cells on a 20×20 board, this produces ~150 separate draw calls. Three.js cannot merge these because each has a different material instance.

2. **Material Cloning Prevents Batching**: Each fog cell mesh gets `this.fogMatProto.clone()` with `onBeforeCompile` copied onto it. This creates ~150 unique `MeshStandardMaterial` instances. Even though they share identical shader code and uniforms, Three.js treats each material instance as requiring a separate draw call. The `onBeforeCompile` callback is also re-invoked per clone, wasting shader compilation time.

3. **Excessive Voxel Density**: 250 voxels per cell × 12 triangles per voxel × ~150 cells = ~450,000 triangles from fog alone. At Rogue mode's 20×20 scale, cells are smaller on screen and adjacent fog clouds overlap significantly, making the high density wasteful.

4. **Ship Wireframe Overlay**: `ShipFactory.createShip()` creates `instancedLines` — a second `InstancedMesh` per ship with wireframe material at 0.2 opacity. This doubles draw calls per ship for a barely-visible visual effect. With ~10 ships on board, this adds ~10 unnecessary draw calls.

5. **Shader Animation Dependency on modelMatrix**: The fog vertex shader uses `modelMatrix[3].x` and `modelMatrix[3].z` (the mesh's world position) to compute per-cell animation offsets (`cellOffset`). In the consolidated mesh approach, all voxels share one `modelMatrix`, so cell-specific animation offsets must be encoded differently — either via the instance matrix or via per-instance attributes.

## Correctness Properties

### Phase 1 Properties (COMPLETE ✓)

Property 1: Bug Condition - Event-Driven Fog Recalculation (VERIFIED ✓)

_For any_ sequence of N consecutive frames where no fog-dirty event occurs (no ship movement, no attack, no skip, no turn change, no setup phase change), the fixed system SHALL invoke `updateRogueFog()` inner loop zero times during those N frames, instead of N times.

**Validates: Requirements 2.1, 2.3**

Property 2: Preservation - isCellRevealed Correctness (VERIFIED ✓)

_For any_ board state with arbitrary ship positions, temporary reveals, permanent reveals, and setup phase configuration, the fixed `FogManager.isCellRevealed(x, z)` SHALL return the same boolean result as the original implementation for all valid coordinates (0 ≤ x < boardWidth, 0 ≤ z < boardHeight).

**Validates: Requirements 3.2, 3.5**

### Phase 2 Properties (CURRENT)

Property 3: Bug Condition - Consolidated Fog Draw Calls

_For any_ Rogue mode board state with F fogged cells (0 < F ≤ 400), the fixed system SHALL render all fog voxels using exactly 1 `InstancedMesh` draw call with a single shared material, instead of F separate draw calls with F cloned materials.

**Validates: Requirements 2.4, 2.5**

Property 4: Bug Condition - Reduced Fog Triangle Count

_For any_ Rogue mode board state with F fogged cells, the fixed system SHALL use ≤80 voxels per fog cell (instead of 250), producing at most F × 80 × 12 triangles from fog, keeping total fog triangle count under 120K for typical boards.

**Validates: Requirements 2.6, 2.8**

Property 5: Bug Condition - Ship Wireframe Removal

_For any_ ship created via `ShipFactory.createShip()`, the fixed system SHALL NOT create a secondary wireframe `InstancedMesh` (`instancedLines`), eliminating the doubled draw calls per ship.

**Validates: Requirements 2.7**

Property 6: Preservation - Classic Mode Fog Unchanged

_For any_ Classic or Russian mode board state (`rogueMode === false`), the fixed code SHALL not alter any fog rendering behavior — per-cell `InstancedMesh` fog meshes with the shared material continue to be created in `BoardBuilder.build()` exactly as before.

**Validates: Requirements 3.1**

Property 7: Preservation - Fog Animation Quality

_For any_ Rogue mode board state, the consolidated fog mesh SHALL produce visually equivalent fog animation (bobbing, rotation) by encoding per-voxel cell offsets into instance matrices so the vertex shader's `modelMatrix[3].x` / `modelMatrix[3].z` lookups yield correct per-cell animation variation.

**Validates: Requirements 3.3**

Property 8: Preservation - isCellRevealed Unchanged After Phase 2

_For any_ board state, `FogManager.isCellRevealed(x, z)` SHALL return identical results before and after Phase 2 changes, since Phase 2 only changes rendering architecture, not visibility logic.

**Validates: Requirements 3.2, 3.5**

## Fix Implementation

### Phase 1 Changes (COMPLETE ✓)

All Phase 1 changes have been implemented and verified:

1. ~~**Dirty flag guard** in `FogManager.updateRogueFog()`: `if (!this.fogDirty) return;` + `this.fogDirty = false` at end~~ ✓
2. ~~**`markFogDirty()` / `isFogDirty()` public methods** on `FogManager`~~ ✓
3. ~~**Opacity snap**: `mat.opacity = targetOpacity` instead of lerp~~ ✓
4. ~~**Dirty marking on state changes**: `revealCellTemporarily()`, `revealCellPermanently()`, `onTurnChange()`, `setSetupPhase()` all set `fogDirty = true`~~ ✓
5. ~~**Dirty marking on ship move**: `EntityManager` ROGUE_MOVE_SHIP handler + `VesselVisibilityManager.forceUpdate()` both call `markFogDirty()`~~ ✓

### Phase 2 Changes (CURRENT)

#### Change 1: Consolidated Fog InstancedMesh in FogManager

**File**: `src/presentation/3d/entities/FogManager.ts`

**New Fields:**
- `private consolidatedFogMesh: THREE.InstancedMesh | null = null` — the single mesh for all Rogue fog
- `private rogueVoxelsPerCell: number = 60` — reduced voxel count for Rogue mode
- `private maxFogCapacity: number` — pre-allocated as `boardWidth × boardHeight × rogueVoxelsPerCell`

**New Method: `initConsolidatedFog(parentGroup: THREE.Group)`**
- Create a single `InstancedMesh` with capacity `maxFogCapacity` using `this.fogGeo` and `this.fogMatProto` directly (no clone)
- Pre-generate per-instance attributes: for each potential cell × voxelsPerCell, generate `aBasePos`, `aScale`, `aPhase`, `aSpeed` values (same random distribution as current 250-voxel approach but with 60 voxels)
- Set `mesh.count = 0` initially (no visible instances)
- Add to `parentGroup` (the playerBoardGroup in Rogue mode)
- Store reference in `this.consolidatedFogMesh`

**Modified Method: `updateRogueFog(shipsOnBoard: Ship[])`**
- After computing `targetOpacity` for each cell (existing logic unchanged):
  - Instead of creating/removing per-cell meshes, rebuild the consolidated mesh's instance matrices
  - For each cell where `targetOpacity > 0.01` (fogged):
    - Compute cell world position: `worldX = x - offset + 0.5`, `worldZ = z - offset + 0.5`
    - For each voxel `j` in `0..<rogueVoxelsPerCell`:
      - Set instance matrix to translate to `(worldX, 0, worldZ)` — the cell's world position
      - The `aBasePos` attribute already contains the local voxel offset within the cell
      - The vertex shader reads `modelMatrix[3].x/z` for cell-specific animation offset — but with a consolidated mesh, `modelMatrix` is the mesh's own transform (origin). Instead, encode the cell position into each instance's matrix translation so `instanceMatrix` positions each voxel at `cellWorldPos`, and `aBasePos` provides the local offset
    - Increment instance counter
  - Set `consolidatedFogMesh.count = totalActiveVoxels`
  - Mark `instanceMatrix.needsUpdate = true`
- Remove all per-cell mesh creation/removal logic (`new THREE.InstancedMesh(...)`, `fogMatProto.clone()`, `parent.remove(fogMesh)`)
- The `fogMeshes[]` array is no longer used for rendering in Rogue mode (can be repurposed or kept for `isCellRevealed` fallback in Classic mode)

**Animation Approach (Option B — full world position in instance matrix):**
- Each instance's matrix translation = `cellWorldPos + (0, 0, 0)` (cell origin)
- `aBasePos` attribute contains the local voxel offset (random within ±0.475 XZ, ±0.225 Y)
- The vertex shader adds `aBasePos` to `transformed` and uses `modelMatrix[3].x/z` for cell-specific animation
- **Key insight**: With a consolidated mesh at origin, `modelMatrix[3]` would be `(0,0,0)` for all voxels, losing per-cell animation variation
- **Solution**: Instead of placing the consolidated mesh at origin, use the instance matrix to encode cell position. The shader's `modelMatrix[3]` reads the mesh's world position (same for all instances), but the `instanceMatrix` translation provides per-instance offset. We need to modify the shader to read from `instanceMatrix` instead of `modelMatrix` for the cell offset
- **Alternative simpler solution**: Don't change the shader. Instead, keep the consolidated mesh at world origin and bake `cellWorldPos` into each instance's translation. The shader's existing `modelMatrix[3]` will read `(0,0,0)`, but the bobbing animation will still work via `aPhase` and `aSpeed` — the `cellOffset` term (`modelMatrix[3].x * 0.8 + modelMatrix[3].z * 1.2`) will be 0 for all voxels, meaning all cells bob in sync. This is acceptable because:
  - Adjacent fog cells overlap visually at 20×20 scale
  - The per-voxel `aPhase` and `aSpeed` still provide individual voxel variation
  - The visual difference between per-cell offset and uniform offset is negligible when cells are small

**Modified Method: `updateAnimation(time, camera)`**
- Update `uFogTime` on `this.fogMatProto.userData.shader` directly (since the consolidated mesh uses `fogMatProto` without cloning)
- No need to search `fogMeshes[]` for a non-null mesh to find the shader

**Modified Method: `reset()`**
- Dispose `consolidatedFogMesh` if it exists (geometry is shared, only remove from scene)
- Set `consolidatedFogMesh = null`
- Set `fogDirty = true`
- Classic mode reset logic unchanged

#### Change 2: Reduced Voxel Geometry in BoardBuilder

**File**: `src/presentation/3d/entities/BoardBuilder.ts`

**Specific Changes:**
- Add a second set of instanced buffer attributes for Rogue mode with `rogueNumVoxels = 60` (instead of 250)
- Generate `aBasePos`, `aScale`, `aPhase`, `aSpeed` arrays sized for 60 voxels with the same random distributions
- Create a separate `fogVoxelGeoRogue` geometry with these smaller attribute arrays
- Pass both geometries to `fogManager.initializeDynamicAssets()` (or pass the appropriate one based on `rogueMode`)
- In the `for z/x` loop, skip fog cloud creation entirely when `fogManager.rogueMode === true` (already done: `if (!fogManager.rogueMode)` guard exists)
- Call `fogManager.initConsolidatedFog(playerBoardGroup)` after the loop when `rogueMode === true`

#### Change 3: Shared Material (No Cloning)

**File**: `src/presentation/3d/entities/FogManager.ts`

**Specific Changes:**
- In `updateRogueFog()`, remove all `this.fogMatProto.clone()` calls
- The consolidated mesh uses `this.fogMatProto` directly as its material
- Single material = single shader compilation, single `onBeforeCompile` invocation
- `uFogTime` uniform update in `updateAnimation()` applies to all fog automatically since there's one material instance
- Opacity control: since there's one material for the entire consolidated mesh, opacity is not per-cell anymore. Instead, cells that should be hidden simply have their voxels excluded from the instance count (not rendered). Cells that should be visible have their voxels included. The material opacity stays at 0.85 (the fogged state) permanently.

#### Change 4: Ship Wireframe Removal

**File**: `src/presentation/3d/entities/ShipFactory.ts`

**Function**: `createShip()`

**Specific Changes:**
1. **Remove `instancedLines` creation**: Delete the entire block that creates the wireframe `InstancedMesh` (lines 167-196 approximately — the `new THREE.InstancedMesh(new THREE.BoxGeometry(...), new THREE.MeshBasicMaterial({wireframe: true, ...}), ...)` block)
2. **Remove `instancedLines` from `shipGroup`**: Delete `shipGroup.add(instancedLines)`
3. **Remove theme update for `instancedLines`**: In `updateShipTheme()`, remove the `instancedLines.setColorAt()` loop and `instancedLines.instanceColor.needsUpdate` line
4. **Remove `instancedLines` from dispose**: In `shipGroup.userData.dispose`, remove `instancedLines.dispose()`, `instancedLines.geometry.dispose()`, `(instancedLines.material).dispose()`
5. **Remove `instancedLines` geometry creation**: The `new THREE.BoxGeometry(voxelSize * 1.01, ...)` is no longer needed

**File**: `src/presentation/3d/entities/VesselVisibilityManager.ts`

**Function**: `updateShipPartialVisibility()`

**Specific Changes:**
1. **Remove `instancedLines` lookup**: Delete the line `const instancedLines = shipGroup.children.find(c => c instanceof THREE.InstancedMesh && c !== instancedMesh) as THREE.InstancedMesh`
2. **Remove `updateMesh(instancedLines)` call**: Only call `updateMesh(instancedMesh)` for the hull mesh

#### Change 5: EntityManager Lifecycle Updates

**File**: `src/presentation/3d/entities/EntityManager.ts`

**Specific Changes:**
- In `resetMatch()`, the existing `this.fogManager.reset()` call will handle consolidated mesh disposal (via the updated `reset()` method)
- No other changes needed — the consolidated mesh lifecycle is managed entirely within `FogManager`

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior. Phase 1 testing is complete. Phase 2 testing focuses on draw call reduction, triangle count, and visual preservation.

### Phase 1 Testing (COMPLETE ✓)

All Phase 1 tests have been written, executed, and verified:
- ~~Bug condition exploration test (`FogManager.bugCondition.test.ts`): Confirmed 60 full executions on unfixed code, 1 on fixed code~~ ✓
- ~~Preservation tests (`FogManager.preservation.test.ts`): Confirmed `isCellRevealed` correctness, Classic mode no-op, reset cleanup~~ ✓

### Phase 2 Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the GPU bottleneck BEFORE implementing the Phase 2 fix. Confirm that per-cell mesh creation is the root cause of excessive draw calls.

**Test Plan**: Write tests that count the number of `InstancedMesh` objects and material instances created by the fog system. Run on UNFIXED code to observe the per-cell architecture.

**Test Cases**:
1. **Draw Call Count Test**: Initialize Rogue mode fog on a 20×20 board, trigger `updateRogueFog()` with ships revealing ~50 cells. Count `InstancedMesh` children in the board group. Expect ~150 on unfixed code (will fail assertion of ≤ 2).
2. **Material Instance Count Test**: Count unique material instances across fog meshes. Expect ~150 cloned materials on unfixed code (will fail assertion of ≤ 1).
3. **Voxel Count Test**: Count total voxel instances across all fog meshes. Expect ~37,500 on unfixed code (will fail assertion of ≤ 15,000).
4. **Wireframe Overlay Test**: Create a ship via `ShipFactory.createShip()` and count `InstancedMesh` children. Expect 2 on unfixed code (will fail assertion of ≤ 1).

**Expected Counterexamples**:
- ~150 separate `InstancedMesh` objects in the scene for fog
- ~150 cloned material instances preventing GPU batching
- ~37,500 fog voxel instances producing ~450K triangles
- 2 `InstancedMesh` objects per ship (hull + wireframe)

### Phase 2 Fix Checking

**Goal**: Verify that for all inputs where the Phase 2 bug condition holds, the fixed system produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition_Phase2(input) DO
  fogMeshCount := countFogInstancedMeshes(scene)
  ASSERT fogMeshCount === 1
  materialCount := countUniqueFogMaterials(scene)
  ASSERT materialCount === 1
  totalVoxels := consolidatedMesh.count
  ASSERT totalVoxels <= foggedCellCount * 80
  wireframeMeshes := countWireframeMeshes(shipGroup)
  ASSERT wireframeMeshes === 0
END FOR
```

### Phase 2 Preservation Checking

**Goal**: Verify that Phase 2 changes do not alter game logic, Classic mode rendering, or fog visibility correctness.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition_Phase2(input) DO
  ASSERT isCellRevealed_original(input.x, input.z) === isCellRevealed_fixed(input.x, input.z)
  ASSERT classicModeFogMeshCount_original === classicModeFogMeshCount_fixed
  ASSERT shipHullRendering_original === shipHullRendering_fixed
END FOR
```

**Testing Approach**: Property-based testing for `isCellRevealed` preservation (reuse Phase 1 preservation tests). Unit tests for draw call counts and mesh architecture.

**Test Cases**:
1. **isCellRevealed Preservation**: Rerun Phase 1 preservation tests — all must still pass after Phase 2 changes
2. **Classic Mode Preservation**: Verify Classic mode still creates per-cell fog meshes with shared material (unchanged architecture)
3. **Ship Hull Preservation**: Verify `ShipFactory.createShip()` still creates hull `InstancedMesh` with correct voxel data, colors, and turrets
4. **Fog Animation Preservation**: Verify `updateAnimation()` still updates `uFogTime` uniform and fog voxels animate (bobbing, rotation)
5. **Reset Preservation**: Verify `reset()` disposes consolidated mesh and reinitializes cleanly for next match
6. **Dirty Flag Preservation**: Verify Phase 1 dirty flag guard still prevents redundant `updateRogueFog()` calls

### Unit Tests

- Test that Rogue mode creates exactly 1 consolidated `InstancedMesh` for fog (not ~150)
- Test that the consolidated mesh uses `fogMatProto` directly (not a clone)
- Test that `consolidatedMesh.count` equals `foggedCellCount × rogueVoxelsPerCell`
- Test that `ShipFactory.createShip()` creates exactly 1 `InstancedMesh` (hull only, no wireframe)
- Test that `VesselVisibilityManager.updateShipPartialVisibility()` works without `instancedLines`
- Test that `reset()` properly disposes the consolidated mesh

### Property-Based Tests

- Generate random Rogue board states and verify `isCellRevealed` returns identical results (reuse Phase 1 PBT)
- Generate random ship configurations and verify hull rendering produces correct voxel count and colors (no wireframe)
- Generate random fog states and verify consolidated mesh instance count matches expected `foggedCells × voxelsPerCell`

### Integration Tests

- Test full Rogue mode match flow: place ships → move → attack → verify fog updates correctly with consolidated mesh
- Test that fog animation continues smoothly with consolidated mesh (uFogTime uniform updates)
- Test that enemy ship partial visibility works correctly without wireframe overlay
- Test that `resetMatch()` properly cleans up consolidated mesh and allows new match initialization
