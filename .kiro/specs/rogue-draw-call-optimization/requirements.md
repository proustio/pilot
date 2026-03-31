# Requirements Document

## Introduction

The 3D Voxel Battleships game currently runs at approximately 10 FPS in Rogue mode due to an excessive number of GPU draw calls (~991, against a target of <100). The root cause is that several rendering subsystems create individual `THREE.Mesh` objects instead of using batched or instanced rendering. This specification defines the requirements for optimizing the four identified draw call bottlenecks: the particle system, turret meshes, board decoration meshes, and range highlight meshes. The goal is to reduce total draw calls to under 100 while preserving full visual fidelity.

## Glossary

- **Particle_System**: The `ParticleSystem` class responsible for spawning and updating fire, smoke, explosion, and splash particle effects as individual `THREE.Mesh` objects
- **Emitter_Manager**: The `EmitterManager` class that schedules continuous particle spawns (fire and smoke) at timed intervals for hit cells and burning ships
- **Board_Mesh_Factory**: The `BoardMeshFactory` class that creates structural board decoration meshes (rivets, screws, borders, brackets, LEDs, base, bottom plane)
- **Range_Highlighter**: The `RangeHighlighter` class that creates individual plane meshes for move, vision, and attack range overlays in Rogue mode
- **Ship_Factory**: The `ShipFactory` class that constructs voxel ship models including turret sub-meshes (base box + barrel cylinder per turret)
- **Instanced_Mesh**: A `THREE.InstancedMesh` object that renders many copies of the same geometry in a single draw call by using per-instance transformation matrices
- **Draw_Call**: A single GPU rendering command issued by the Three.js renderer; each visible `THREE.Mesh` or `THREE.InstancedMesh` with a unique material generates one draw call
- **Entity_Manager**: The `EntityManager` class that orchestrates scene updates, ship placement, projectile management, and animation delegation
- **Frame_Time**: The elapsed time in milliseconds to render a single frame; the current Rogue mode frame time is ~101ms (target: ≤16.6ms for 60 FPS)

## Requirements

### Requirement 1: Instanced Particle Rendering

**User Story:** As a player, I want smooth frame rates during combat in Rogue mode, so that fire, smoke, and explosion effects do not cause the game to stutter.

#### Acceptance Criteria

1. THE Particle_System SHALL render all active fire particles using a single Instanced_Mesh with a shared fire material
2. THE Particle_System SHALL render all active smoke particles using a single Instanced_Mesh with a shared smoke material
3. THE Particle_System SHALL render all active explosion and splash particles using a single Instanced_Mesh with a shared explosion material
3a. THE Particle_System SHALL render all active fog-of-war voxel particles using a single Instanced_Mesh with a shared fog material, replacing per-cell fog InstancedMesh creation in FogManager
4. WHEN a new particle is spawned, THE Particle_System SHALL assign the particle to the next available instance slot in the corresponding Instanced_Mesh rather than creating a new THREE.Mesh object
5. WHEN a particle expires, THE Particle_System SHALL hide the instance by zeroing its scale in the instance matrix rather than removing a mesh from the scene graph
6. THE Particle_System SHALL pre-allocate instance capacity sufficient for the maximum expected concurrent particle count per type (fire: 256, smoke: 384, explosion: 128, splash: 128, fog: 512)
7. WHEN the active particle count exceeds the pre-allocated capacity for a given type, THE Particle_System SHALL recycle the oldest particle instance of that type
8. THE Particle_System SHALL update per-instance transforms (position, rotation, scale) each frame by writing to the Instanced_Mesh instance matrix buffer and setting `instanceMatrix.needsUpdate` to true
9. THE Particle_System SHALL update per-instance colors each frame by writing to the Instanced_Mesh instance color buffer to support opacity fade and color variation
10. WHEN the `spawnSmoke` method is called, THE Particle_System SHALL reuse the shared smoke material instead of calling `material.clone()` for each particle
11. THE Particle_System SHALL produce a maximum of 5 Draw_Calls for all particle rendering (one per particle type: fire, smoke, explosion, splash, fog)

### Requirement 2: Instanced Turret Rendering

**User Story:** As a player, I want turrets on ships to render efficiently, so that having many ships on the board does not degrade performance.

#### Acceptance Criteria

1. THE Ship_Factory SHALL render all turret bases across all ships on a given board using a single shared Instanced_Mesh with a shared turret base material
2. THE Ship_Factory SHALL render all turret barrels across all ships on a given board using a single shared Instanced_Mesh with a shared turret barrel material
3. WHEN a new ship is added to the board, THE Ship_Factory SHALL append turret instance transforms to the shared turret Instanced_Meshes rather than creating individual THREE.Mesh objects per turret component
4. WHEN a ship is removed from the board, THE Ship_Factory SHALL hide the corresponding turret instances by zeroing their scale in the instance matrix
5. THE Ship_Factory SHALL produce a maximum of 2 Draw_Calls for all turret rendering per board (one for bases, one for barrels)
6. WHILE a ship is sinking, THE Entity_Manager SHALL update the turret instance transforms to follow the ship's sinking position and rotation

### Requirement 3: Merged Board Decoration Rendering

**User Story:** As a player, I want the board frame and decorations to look identical to the current design while consuming fewer draw calls.

#### Acceptance Criteria

1. THE Board_Mesh_Factory SHALL render all rivet meshes using a single Instanced_Mesh with a shared rivet material instead of 32 individual THREE.Mesh objects
2. THE Board_Mesh_Factory SHALL render all screw head meshes using a single Instanced_Mesh with a shared screw material instead of individual THREE.Mesh objects per screw
3. THE Board_Mesh_Factory SHALL render all screw slot meshes using a single Instanced_Mesh with a shared slot material instead of individual THREE.Mesh objects per slot
4. THE Board_Mesh_Factory SHALL render all corner bracket meshes using a single Instanced_Mesh with a shared bracket material instead of 4 individual THREE.Mesh objects
5. THE Board_Mesh_Factory SHALL render all status LED meshes using a single Instanced_Mesh with a shared LED material instead of 4 individual THREE.Mesh objects
6. THE Board_Mesh_Factory SHALL render all 4 border frame meshes using a single Instanced_Mesh with a shared frame material instead of 4 individual THREE.Mesh objects
7. WHEN the theme changes, THE Board_Mesh_Factory SHALL update the shared materials on the Instanced_Meshes to reflect the new theme colors
8. THE Board_Mesh_Factory SHALL produce a maximum of 8 Draw_Calls for all board decoration rendering (rivets, screws, screw slots, brackets, LEDs, borders, base, bottom plane)

### Requirement 4: Instanced Range Highlight Rendering

**User Story:** As a player, I want move, vision, and attack range highlights to display without causing frame rate drops on the 20x20 Rogue board.

#### Acceptance Criteria

1. THE Range_Highlighter SHALL render all move highlight cells using a single Instanced_Mesh with a shared move highlight material instead of individual THREE.Mesh objects per cell
2. THE Range_Highlighter SHALL render all vision highlight cells using a single Instanced_Mesh with a shared vision highlight material instead of individual THREE.Mesh objects per cell
3. THE Range_Highlighter SHALL render all attack highlight cells using a single Instanced_Mesh with a shared attack highlight material instead of individual THREE.Mesh objects per cell
4. WHEN range highlights are rebuilt, THE Range_Highlighter SHALL update instance transforms in the pre-allocated Instanced_Meshes and hide unused instances by zeroing their scale
5. WHEN range highlights are hidden, THE Range_Highlighter SHALL set the Instanced_Mesh visibility to false rather than disposing and recreating meshes
6. THE Range_Highlighter SHALL pre-allocate instance capacity sufficient for the maximum possible highlighted cell count on a 20x20 board (up to 400 cells per highlight type)
7. THE Range_Highlighter SHALL produce a maximum of 3 Draw_Calls for all range highlight rendering (one per highlight type: move, vision, attack)

### Requirement 5: Draw Call Budget Compliance

**User Story:** As a player, I want the game to maintain at least 30 FPS in Rogue mode with all visual effects active, so that the game feels responsive and playable.

#### Acceptance Criteria

1. WHILE in Rogue mode with 12 ships on the board and active fire/smoke effects, THE Entity_Manager SHALL maintain a total scene Draw_Call count below 100
2. WHILE in Rogue mode, THE Entity_Manager SHALL maintain a Frame_Time below 33ms (at least 30 FPS) on hardware that achieves 60 FPS in Classic mode
3. THE Particle_System SHALL limit the maximum concurrent particle instance count to a configurable cap to prevent unbounded draw call or memory growth
4. IF the total Draw_Call count exceeds 100 during gameplay, THEN THE Particle_System SHALL reduce particle spawn rates proportionally until the count falls below the target

### Requirement 6: Visual Fidelity Preservation

**User Story:** As a player, I want the optimized rendering to look identical to the current visual output, so that the game's aesthetic quality is not degraded.

#### Acceptance Criteria

1. THE Particle_System SHALL preserve the existing visual behavior of fire particles including upward drift, flicker, and scale decay
2. THE Particle_System SHALL preserve the existing visual behavior of smoke particles including expansion, wind wobble, and opacity fade
3. THE Particle_System SHALL preserve the existing visual behavior of explosion and splash particles including outward burst velocity and gravity
4. THE Ship_Factory SHALL preserve the existing turret visual appearance including base dimensions, barrel dimensions, and material colors
5. THE Board_Mesh_Factory SHALL preserve the existing visual appearance of all board decorations including rivet spacing, screw slot orientation, bracket dimensions, and LED pulse animation
6. THE Range_Highlighter SHALL preserve the existing visual appearance of range highlights including colors, opacity levels, and depth test settings
7. WHEN particles are rendered via Instanced_Mesh, THE Particle_System SHALL support per-instance opacity variation to maintain the existing smoke transparency fade effect

### Requirement 7: Emitter Spawn Rate Optimization

**User Story:** As a player, I want fire and smoke effects to remain visually convincing while consuming fewer resources, so that battles with many burning ships remain playable.

#### Acceptance Criteria

1. THE Emitter_Manager SHALL enforce a global maximum of active emitters to prevent unbounded particle generation as ships accumulate damage
2. WHEN the number of active emitters exceeds the global maximum, THE Emitter_Manager SHALL reduce spawn frequency for lower-intensity emitters proportionally
3. THE Emitter_Manager SHALL batch all emitter spawn requests within a single frame into the corresponding Instanced_Mesh instance pools managed by the Particle_System
4. WHILE more than 8 emitters are active simultaneously, THE Emitter_Manager SHALL increase the spawn interval by a factor proportional to the emitter count to maintain the particle instance budget

### Requirement 8: Resource Cleanup and Disposal

**User Story:** As a player, I want the game to properly clean up GPU resources when matches end or reset, so that memory does not leak across games.

#### Acceptance Criteria

1. WHEN a match is reset, THE Particle_System SHALL reset all Instanced_Mesh instance matrices to zero scale and reset the active particle tracking state
2. WHEN a match is reset, THE Entity_Manager SHALL dispose of shared turret Instanced_Meshes and recreate them for the new match
3. WHEN the Particle_System is disposed, THE Particle_System SHALL dispose all Instanced_Mesh geometries and materials
4. THE Particle_System SHALL avoid creating or disposing THREE.Material objects during gameplay; all materials SHALL be allocated once during initialization and reused
