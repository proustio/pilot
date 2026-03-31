# Implementation Plan: Rogue Draw Call Optimization

## Overview

Replace individual `THREE.Mesh` objects with pre-allocated `THREE.InstancedMesh` pools across four subsystems (particles, board decorations, range highlights, turrets) and add emitter throttling + draw call budget enforcement. Tasks are ordered by draw call savings impact: particles first (highest savings), then board decorations, range highlights, turrets, emitter throttling, and finally integration/verification.

## Tasks

- [-] 1. Implement instanced particle rendering (ParticleSystem)
  - [ ] 1.1 Add InstancePool data structure and pool initialization
    - Define `InstancedParticle` and `InstancePool` interfaces in `ParticleSystem.ts`
    - Add `PARTICLE_POOL_CONFIG` constants (fire: 256, smoke: 384, explosion: 128, splash: 128, fog: 512)
    - Implement `initPools(parentGroup)` to create 5 `InstancedMesh` objects with shared geometries and materials
    - Force `instanceColor` buffer creation by calling `setColorAt(0, white)` then zeroing
    - Initialize all instance matrices to zero-scale
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.11_

  - [ ] 1.2 Implement free-list slot allocator
    - Implement `allocateSlot(pool)` — pops from `freeSlots` stack, or recycles oldest active particle if full
    - Implement `releaseSlot(pool, slot)` — zeros instance matrix at slot, pushes slot index back to `freeSlots`
    - Cache a `zeroMatrix` (zero-scale `Matrix4`) as a class field for reuse
    - _Requirements: 1.4, 1.5, 1.7_

  - [ ] 1.3 Refactor spawn methods to use instance slots
    - Refactor `spawnFire()` to allocate a slot from the fire pool and store an `InstancedParticle` instead of creating a `THREE.Mesh`
    - Refactor `spawnSmoke()` to allocate from the smoke pool; remove `material.clone()` call, use shared smoke material
    - Refactor `spawnExplosion()` to allocate slots from the explosion pool
    - Refactor `spawnSplash()` to allocate slots from the splash pool
    - Add `spawnFog()` method to allocate from the fog pool (replaces per-cell fog InstancedMesh creation in FogManager)
    - _Requirements: 1.4, 1.10_

  - [ ] 1.4 Refactor update loop to write instance matrices and colors per frame
    - Replace per-mesh position/rotation/scale updates with per-instance matrix writes using `setMatrixAt()`
    - Write per-instance colors using `setColorAt()` for smoke opacity fade and splash color variation
    - Set `instanceMatrix.needsUpdate = true` and `instanceColor.needsUpdate = true` on pools with active instances
    - On particle expiry (`life <= 0`), call `releaseSlot()` instead of `group.remove(mesh)`
    - Preserve fire flicker (emissive pulsation via color), smoke expansion/wobble, explosion/splash gravity
    - _Requirements: 1.5, 1.8, 1.9, 6.1, 6.2, 6.3, 6.7_

  - [ ] 1.5 Refactor clear() and dispose() for instanced pools
    - `clear()`: zero all instance matrices in all pools, reset `activeCount` to 0, refill `freeSlots` to capacity
    - `dispose()`: dispose all 5 `InstancedMesh` geometries and materials
    - _Requirements: 8.1, 8.3, 8.4_

  - [ ]* 1.6 Write property tests for particle instancing (Properties 1–6, 15–16)
    - **Property 1: Single InstancedMesh per particle type** — spawn random counts, verify exactly 5 InstancedMesh objects and 0 individual meshes
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.11**

  - [ ]* 1.7 Write property test for no material allocation on spawn
    - **Property 2: No material or mesh allocation on spawn** — spawn random particle sequences, verify material/mesh count unchanged from initialization
    - **Validates: Requirements 1.4, 1.10, 8.4**

  - [ ]* 1.8 Write property test for pool capacity invariant
    - **Property 3: Particle pool capacity invariant** — spawn more than capacity, verify active count ≤ capacity and oldest evicted
    - **Validates: Requirements 1.7, 5.3**

  - [ ]* 1.9 Write property test for per-frame buffer update flags
    - **Property 4: Per-frame buffer update flag** — spawn particles then call update(), verify needsUpdate flags set correctly
    - **Validates: Requirements 1.8, 1.9, 6.7**

  - [ ]* 1.10 Write property test for zero-scale hiding on expiry
    - **Property 5: Zero-scale hiding on expiry** — spawn particles, advance time until expiry, verify zero-scale matrix and free list restoration
    - **Validates: Requirements 1.5**

  - [ ]* 1.11 Write property test for particle physics invariants
    - **Property 6: Particle physics invariants preserved** — spawn each type, run N updates, verify fire rises/shrinks, smoke expands/fades, explosion/splash has gravity
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 1.12 Write property tests for clear and dispose
    - **Property 15: Clear resets all pool state** — spawn random particles, call clear(), verify all pools fully reset
    - **Validates: Requirements 8.1**
    - **Property 16: Dispose releases all GPU resources** — spawn random particles, call dispose(), verify all geometries/materials disposed
    - **Validates: Requirements 8.3**

- [ ] 2. Manual verification — Particle instancing
  - Stop and let the user verify particle rendering in a live game before proceeding. Fire, smoke, explosions, and splash effects should look identical to before. Fog particles should render correctly in Rogue mode.

- [ ] 3. Implement instanced board decoration rendering (BoardMeshFactory)
  - [ ] 3.1 Refactor BoardMeshFactory.build() to use InstancedMesh for decorations
    - Replace 32 individual rivet meshes with 1 `InstancedMesh(rivetGeo, rivetMat, 32)`
    - Replace 4 individual screw head meshes with 1 `InstancedMesh(screwGeo, screwMat, 4)`
    - Replace 4 individual screw slot meshes with 1 `InstancedMesh(screwSlotGeo, screwSlotMat, 4)`
    - Replace 4 individual bracket meshes with 1 `InstancedMesh(bracketGeo, frameMat, 4)`
    - Replace 4 individual LED meshes with 1 `InstancedMesh(ledGeo, ledMat, 4)`
    - Replace 4 individual border meshes with 1 `InstancedMesh(borderGeo, frameMat, 4)`
    - Keep base mesh and bottom plane as individual meshes (1 each)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8_

  - [ ] 3.2 Extend BoardMeshFactory return type for LED animation
    - Add `ledMesh: THREE.InstancedMesh` and `ledPhases: number[]` to the return interface (`BoardMeshBuildResult`)
    - Store per-LED phase offsets for animation in `ledPhases` array
    - _Requirements: 3.5, 6.5_

  - [ ] 3.3 Update theme reactivity for instanced board decorations
    - Update theme change handler to modify shared materials on InstancedMesh objects (rivet, screw, frame materials)
    - Verify LED color updates work via the shared LED material
    - _Requirements: 3.7_

  - [ ]* 3.4 Write property test for board decoration theme reactivity
    - **Property 17: Board decoration theme reactivity** — trigger theme change, verify shared material colors match ThemeManager values
    - **Validates: Requirements 3.7**

  - [ ]* 3.5 Write unit tests for board decoration instance counts
    - Verify exact instance counts: 32 rivets, 4 screws, 4 screw slots, 4 brackets, 4 LEDs, 4 borders
    - Verify total draw calls = 8 for all board decorations
    - _Requirements: 3.1–3.6, 3.8_

- [ ] 4. Implement instanced range highlight rendering (RangeHighlighter)
  - [ ] 4.1 Replace per-cell meshes with pre-allocated InstancedMesh pools
    - Create 3 `InstancedMesh` objects (move, vision, attack) with capacity 400 each (20×20 board max)
    - Use shared `PlaneGeometry(0.9, 0.9)` for move and `PlaneGeometry(0.95, 0.95)` for vision/attack
    - Use shared `MeshBasicMaterial` per type with existing colors (move=0x00ffff, vision=0x4169E1, attack=0xFFA500)
    - Cache a zero-scale `Matrix4` for hiding unused instances
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7_

  - [ ] 4.2 Refactor rebuildMoveHighlight() and rebuildRangeHighlights()
    - Write valid cell transforms to instance matrices using `setMatrixAt()`
    - Zero remaining slots beyond the active cell count
    - Set `instanceMatrix.needsUpdate = true` after each rebuild
    - Remove `disposeGroupChildren()` method entirely (no longer needed)
    - _Requirements: 4.4_

  - [ ] 4.3 Refactor hideAll() and add dispose()
    - `hideAll()`: set `visible = false` on each InstancedMesh (no disposal)
    - Add `dispose()` method to dispose the 3 InstancedMesh geometries and materials on full cleanup
    - _Requirements: 4.5_

  - [ ]* 4.4 Write property test for highlight instancing
    - **Property 10: Highlight instancing uses exactly 3 InstancedMesh objects** — rebuild with random cell counts, verify exactly 3 InstancedMesh objects and 0 individual plane meshes
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.7**

  - [ ]* 4.5 Write property test for highlight rebuild correctness
    - **Property 11: Highlight rebuild writes correct instance count** — rebuild with N cells, verify N valid transforms + (C-N) zero-scale matrices
    - **Validates: Requirements 4.4**

  - [ ]* 4.6 Write property test for highlight hide preserves meshes
    - **Property 12: Highlight hide preserves meshes** — rebuild then hideAll(), verify meshes exist with visible=false, then rebuild again successfully
    - **Validates: Requirements 4.5**

- [ ] 5. Manual verification — Board decorations and range highlights
  - Stop and let the user verify board decorations (rivets, screws, brackets, LEDs, borders) and range highlights (move, vision, attack) look identical in a live game before proceeding.

- [ ] 6. Implement TurretInstanceManager and instanced turret rendering
  - [ ] 6.1 Create TurretInstanceManager class
    - Create new file `src/presentation/3d/entities/TurretInstanceManager.ts`
    - Define `TurretTransform` interface with `localPosition`, `barrelOffset`, `barrelRotation`
    - Implement constructor that creates 2 `InstancedMesh` objects (bases: `BoxGeometry(0.15, 0.08, 0.15)`, barrels: `CylinderGeometry(0.025, 0.025, 0.2, 6)`) with capacity 64
    - Implement `addTurrets(shipId, turretTransforms[])` — allocates slots, writes instance matrices, stores ship→slot mapping
    - Implement `removeTurrets(shipId)` — zeros instance matrices for ship's slots, returns slots to free pool
    - Implement `updateTransform(shipId, shipWorldMatrix)` — recomputes turret instance matrices incorporating the ship's current world matrix (for sinking animation)
    - Implement `dispose()` — disposes both InstancedMesh geometries and materials
    - Use player/enemy color inversion logic from existing `ShipFactory.addTurrets()`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 6.2 Refactor ShipFactory.addTurrets() to use TurretInstanceManager
    - Change `addTurrets()` to compute `TurretTransform[]` from ship size and turret count
    - Call `turretInstanceManager.addTurrets(shipId, transforms)` instead of creating individual meshes
    - Accept `TurretInstanceManager` as a parameter (passed from EntityManager)
    - Remove individual turret material and geometry creation from `addTurrets()`
    - _Requirements: 2.1, 2.2, 2.3, 6.4_

  - [ ]* 6.3 Write property test for turret instancing
    - **Property 7: Turret instancing uses exactly 2 InstancedMesh objects** — add random number of ships (0–20), verify exactly 2 turret InstancedMesh objects and 0 individual turret meshes
    - **Validates: Requirements 2.1, 2.2, 2.5**

  - [ ]* 6.4 Write property test for turret add/remove round trip
    - **Property 8: Turret add/remove round trip** — add then remove random ships, verify active count returns to original and removed slots have zero-scale matrices
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 6.5 Write property test for sinking turret transforms
    - **Property 9: Sinking turrets follow ship transform** — set random sinking transforms, verify turret instance matrices incorporate ship's world-space position and rotation
    - **Validates: Requirements 2.6**

- [ ] 7. Implement emitter throttling (EmitterManager)
  - [ ] 7.1 Add throttle logic to EmitterManager.updateEmitters()
    - Add `EMITTER_THROTTLE_THRESHOLD = 8` and `MAX_ACTIVE_EMITTERS = 24` constants
    - In `updateEmitters()`, compute `throttleFactor = threshold / activeCount` when `activeCount > threshold`
    - Multiply spawn intervals by `1 / throttleFactor` to reduce spawn rate proportionally
    - In `addEmitter()`, silently drop new emitters when count exceeds `MAX_ACTIVE_EMITTERS`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 7.2 Write property test for emitter throttling
    - **Property 13: Emitter throttling scales spawn interval** — create random emitter counts (1–30), verify spawn interval scaling and max emitter cap
    - **Validates: Requirements 7.1, 7.2, 7.4**

- [ ] 8. Manual verification — Turrets and emitter throttling
  - Stop and let the user verify turret rendering on ships and emitter throttling behavior in a live game before proceeding.

- [ ] 9. Integration and wiring (EntityManager)
  - [ ] 9.1 Integrate TurretInstanceManager into EntityManager
    - Create `TurretInstanceManager` instance in EntityManager constructor, attached to `playerBoardGroup`
    - Pass `TurretInstanceManager` reference to `ShipFactory.createShip()` calls in `addShip()`
    - In `update()`, iterate sinking ships and call `turretManager.updateTransform(shipId, shipWorldMatrix)`
    - In `resetMatch()`, call `turretManager.dispose()` and recreate for the new match
    - _Requirements: 2.6, 8.2_

  - [ ] 9.2 Update LED animation to use instanced colors
    - Refactor `updateStaticAnimations()` to use the `ledMesh` InstancedMesh reference from `BoardMeshBuildResult`
    - Animate LED opacity via `setColorAt()` with alpha-modulated color values instead of per-mesh material mutation
    - Set `instanceColor.needsUpdate = true` after LED color writes
    - _Requirements: 3.5, 6.5_

  - [ ] 9.3 Add draw call budget enforcement
    - Read `renderer.info.render.calls` each frame in `update()`
    - Compute `particleSpawnScale` (0.0–1.0) when draw calls exceed target of 100
    - Pass `particleSpawnScale` to `ParticleSystem` to throttle spawn counts proportionally
    - Restore scale to 1.0 when draw calls fall below target
    - Add floor of 0.1× to ensure some visual feedback always present
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 9.4 Wire ParticleSystem pool initialization with parent group
    - Ensure `ParticleSystem.initPools()` is called with the correct parent group during EntityManager construction
    - Verify particle InstancedMesh objects (including fog pool) are added to the scene graph
    - Wire FogManager to use ParticleSystem's fog pool instead of creating per-cell fog InstancedMesh objects
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 9.5 Write property test for draw call budget enforcement
    - **Property 14: Draw call budget enforcement** — simulate draw call counts above/below 100, verify spawn rate scale factor adjusts proportionally
    - **Validates: Requirements 5.4**

- [ ] 10. Manual verification — Full integration
  - Stop and let the user verify the complete Rogue mode experience in a live game. Check draw call count in Geek Stats panel (target: <100), verify FPS improvement, and confirm all visual effects are intact.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major subsystem
- Property tests validate universal correctness properties from the design document
- Test files go in `src/presentation/3d/entities/__tests__/` per the design's Testing Strategy section
- All tests mock Three.js objects to avoid WebGL context requirements
