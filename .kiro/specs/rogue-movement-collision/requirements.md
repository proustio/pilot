# Requirements Document

## Introduction

This feature sprint overhauls Rogue mode's movement and collision systems. Ships need to travel farther, evaluate board state at every cell along their path, respect physical blocking by other entities, and support ramming as a combat mechanic. The movement animation layer also needs polish: water ripples, smooth turning, and normalized animation timing regardless of distance traveled. Additionally, range highlights (vision, attack, movement) must project from all ship segments rather than just the head, fog must be suppressed where range highlights are visible, and a new magenta movement-range highlight must be added.

## Glossary

- **Rogue_Board**: The single shared grid used in Rogue mode, sized by `Config.board.rogueWidth` × `Config.board.rogueHeight` (currently 15×15). All player and enemy entities coexist on this board.
- **Movement_System**: The domain logic in `RogueActionHandler` and `ShipPlacement` that resolves ship movement, pathing, and collision on the Rogue_Board.
- **Ship**: A domain entity (`Ship.ts`) with a head position, orientation, size, segments, and per-turn movement points (`maxMoves`, `movesRemaining`).
- **Dead_Entity**: Any Ship, mine, or sonar whose segments are all destroyed (`isSunk() === true`). Dead entities remain on the Rogue_Board permanently.
- **Static_Entity**: A mine or sonar. These entities occupy board cells but have zero movement capability by design.
- **Ramming**: A collision event where a moving Ship's path intersects a cell occupied by another Ship (friendly or enemy). Both vessels sustain segment damage.
- **Path**: The ordered sequence of cells a Ship traverses from its current position to its target position during a single move action.
- **Fog_of_War**: The visibility radius around each friendly Ship, defined by `Config.rogue.fogRadius` (currently 7 cells). Sections of the Rogue_Board outside all friendly radii are hidden.
- **Movement_Animation**: The 3D presentation-layer interpolation (`ShipAnimator`) that visually moves a ship mesh between grid positions.
- **Water_Ripple**: A shader-driven visual effect (`WaterShaderManager`) triggered at water cells as a ship passes through them.
- **Move_Cost**: The movement point expenditure to reach a target cell, calculated by `Ship.calculateMoveCost` based on direction relative to the Ship's orientation (forward = 0.5/cell, lateral = 1/cell, backward = 2/cell).
- **Animation_Duration**: A fixed, constant time interval used for all movement and turning animations regardless of distance.
- **Range_Highlight**: A colored translucent plane rendered on the Rogue_Board grid to indicate cells within a Ship's vision, attack, or movement range. Managed by `RangeHighlighter.ts` using InstancedMesh pools.
- **Vision_Range**: The set of cells within a Ship's `visionRadius` (Chebyshev distance from any occupied segment). Displayed as a blue Range_Highlight (color `0x4169E1`).
- **Attack_Range**: The set of cells within twice a Ship's `visionRadius` but outside the Vision_Range. Displayed as an orange Range_Highlight (color `0xFFA500`).
- **Movement_Range**: The set of cells reachable by the active Ship based on `movesRemaining` and Move_Cost. Displayed as a magenta Range_Highlight (color `0xFF00FF`).
- **Occupied_Segments**: The full set of grid cells a Ship occupies, returned by `Ship.getOccupiedCoordinates()`. Includes the head cell and all body segments based on orientation.
- **Minimum_Segment_Distance**: For a given target cell and Ship, the smallest distance from any of the Ship's Occupied_Segments to that target cell. Used to determine whether a cell falls within a range radius.

## Requirements

### Requirement 1: Runtime Config-Driven Calculations

**User Story:** As a developer, I want all movement and collision calculations to derive from runtime `Config` values, so that board dimensions, fog radius, and timing constants can be changed without touching game logic.

#### Acceptance Criteria

1. ALL board-dimension-dependent calculations SHALL read grid size from `Config.board.rogueWidth` and `Config.board.rogueHeight` — never hardcoded numeric literals.
2. ALL fog-of-war radius calculations SHALL read from `Config.rogue.fogRadius` — never hardcoded.
3. ALL animation timing calculations SHALL derive from `Config.timing` values scaled by `Config.timing.gameSpeedMultiplier` — never hardcoded durations.
4. WHEN `Config` values change at runtime (e.g., via settings), THE Movement_System and Movement_Animation SHALL respect the updated values on the next action without requiring a game restart.
5. THE Movement_System SHALL perform bounds-checking against `Config.board.rogueWidth` and `Config.board.rogueHeight` to prevent ships from pathing outside the grid.

### Requirement 2: Double Movement Distance

**User Story:** As a player, I want my ships to move twice as far per turn, so that Rogue mode feels more dynamic and ships can cover the board effectively.

#### Acceptance Criteria

1. THE Movement_System SHALL grant each Ship a `maxMoves` value equal to twice the current formula (`maxMoves = Math.max(0, 5 - size) * 2`).
2. WHEN a Ship's turn begins, THE Movement_System SHALL set `movesRemaining` to the Ship's updated `maxMoves` value.
3. THE Movement_System SHALL preserve the existing Move_Cost ratios (forward = 0.5/cell, lateral = 1/cell, backward = 2/cell) after the distance increase.

### Requirement 3: Per-Cell Pathing Evaluation

**User Story:** As a player, I want the game to check each cell along my ship's path, so that mines detonate on contact and fog reveals/hides correctly as the ship travels.

#### Acceptance Criteria

1. WHEN a Ship moves from cell A to cell B, THE Movement_System SHALL compute the full Path as an ordered list of intermediate cells between A and B.
2. FOR EACH cell in the Path, THE Movement_System SHALL evaluate whether the cell contains a mine and trigger detonation before advancing to the next cell.
3. IF a Ship detonates a mine during pathing, THEN THE Movement_System SHALL stop the Ship at the mine's cell and apply segment damage to both the Ship and the mine.
4. FOR EACH cell in the Path, THE Movement_System SHALL re-evaluate Fog_of_War visibility based on the Ship's current intermediate position.
5. WHEN a Ship completes its move, THE Movement_System SHALL finalize Fog_of_War state based on the Ship's final resting position.

### Requirement 4: Impassable Entities

**User Story:** As a player, I want ships to be blocked by other ships (dead or alive), so that positioning and board control matter tactically.

#### Acceptance Criteria

1. WHEN a Ship attempts to move through a cell occupied by another Ship, THE Movement_System SHALL reject the move and stop the Ship at the last unoccupied cell before the obstruction.
2. THE Movement_System SHALL treat Dead_Entity ships as impassable obstacles identical to living ships.
3. THE Movement_System SHALL treat cells in `CellState.Sunk` status as impassable.
4. WHEN a Ship's computed Path is fully blocked at the first cell, THE Movement_System SHALL reject the entire move and leave the Ship in its original position.

### Requirement 5: Static Entity Immobility

**User Story:** As a player, I want mines, sonars, and dead ships to remain fixed in place, so that the board state is predictable and strategic.

#### Acceptance Criteria

1. THE Movement_System SHALL prevent any Static_Entity (mine or sonar) from being issued a move command.
2. THE Movement_System SHALL prevent any Dead_Entity from being issued a move command.
3. WHEN the AI attempts to move a Dead_Entity or Static_Entity, THE Movement_System SHALL skip that entity's movement phase and advance to the next entity.

### Requirement 6: Ramming Mechanics

**User Story:** As a player, I want ships to ram other ships when they collide, so that movement becomes a tactical weapon with risk and reward.

#### Acceptance Criteria

1. WHEN a moving Ship's Path intersects a cell occupied by another Ship (friendly or enemy), THE Movement_System SHALL trigger a Ramming event.
2. WHEN Ramming occurs, THE Movement_System SHALL inflict 1 segment of damage to the front segment of the ramming Ship.
3. WHEN Ramming occurs, THE Movement_System SHALL inflict 1 segment of damage to the nearest segment of the rammed Ship.
4. WHEN Ramming occurs, THE Movement_System SHALL rotate the ramming Ship 90 degrees from its current orientation.
5. WHEN Ramming occurs, THE Movement_System SHALL stop the ramming Ship in the last unoccupied cell adjacent to the rammed Ship (the cell immediately before the collision point in the Path).
6. WHEN Ramming occurs, THE Movement_System SHALL set the ramming Ship's `movesRemaining` to 0 and `hasActedThisTurn` to true.
7. THE Movement_System SHALL apply Ramming identically regardless of whether the rammed Ship is friendly or enemy.

### Requirement 7: Movement Animation Normalization

**User Story:** As a player, I want all ship movements to take the same amount of time visually, so that the game feels polished and consistent.

#### Acceptance Criteria

1. THE Movement_Animation SHALL complete in a fixed Animation_Duration regardless of the number of cells traversed (1 cell or 4 cells).
2. THE Movement_Animation SHALL complete turning animations in the same fixed Animation_Duration as movement animations.
3. THE Movement_Animation SHALL interpolate the Ship mesh smoothly through each intermediate cell in the Path without teleporting during direction changes.
4. WHEN a Ship changes orientation mid-move, THE Movement_Animation SHALL blend the rotation smoothly over the Animation_Duration rather than snapping instantly.

### Requirement 8: Water Ripple Effects During Movement

**User Story:** As a player, I want to see water ripples trailing behind moving ships, so that movement feels physical and immersive.

#### Acceptance Criteria

1. WHEN a Ship moves, THE Water_Ripple system SHALL spawn a ripple effect at each cell the Ship passes through along its Path.
2. THE Water_Ripple system SHALL space ripple spawns evenly across the Animation_Duration so ripples trail behind the Ship visually.
3. THE Water_Ripple system SHALL use the existing `WaterShaderManager.addRipple` API to trigger each ripple at the correct world-space coordinates.

### Requirement 9: Ramming Animation

**User Story:** As a player, I want a distinct visual when ships ram each other, so that collisions feel impactful and are clearly communicated.

#### Acceptance Criteria

1. WHEN Ramming occurs, THE Movement_Animation SHALL play a collision impact effect at the point of contact between the two ships.
2. WHEN Ramming occurs, THE Movement_Animation SHALL animate the ramming Ship's 90-degree rotation smoothly over the Animation_Duration.
3. WHEN Ramming occurs, THE Movement_Animation SHALL trigger a camera shake or screen impact effect to communicate the collision force.

### Requirement 10: Multi-Segment Range Projection

**User Story:** As a player, I want vision, attack, and movement range highlights to project from all segments of my ship, so that larger ships correctly show their full area of influence rather than only from the head segment.

#### Acceptance Criteria

1. WHEN computing Vision_Range for a Ship, THE Range_Highlight system SHALL calculate the Minimum_Segment_Distance from the Ship's Occupied_Segments to each board cell, and include the cell if that distance is within the Ship's `visionRadius`.
2. WHEN computing Attack_Range for a Ship, THE Range_Highlight system SHALL calculate the Minimum_Segment_Distance from the Ship's Occupied_Segments to each board cell, and include the cell if that distance is within twice the Ship's `visionRadius` but outside the Vision_Range.
3. WHEN computing Movement_Range for a Ship, THE Range_Highlight system SHALL calculate the Minimum_Segment_Distance from the Ship's Occupied_Segments to each board cell, and include the cell if the Manhattan distance is within the Ship's `movesRemaining`.
4. THE Range_Highlight system SHALL use `Ship.getOccupiedCoordinates()` to obtain the full set of Occupied_Segments for the active Ship.
5. THE Range_Highlight system SHALL exclude cells occupied by the active Ship itself from all range highlight displays.

### Requirement 11: Fog Transparency for Range Highlights

**User Story:** As a player, I want fog to be transparent where range highlights are visible, so that I can see the colored highlights through the fog and make informed tactical decisions.

#### Acceptance Criteria

1. WHILE a Ship is the active selection, THE Fog_of_War system SHALL suppress fog rendering in cells that fall within the active Ship's Vision_Range, Attack_Range, or Movement_Range.
2. WHEN the active Ship changes or is deselected, THE Fog_of_War system SHALL restore fog rendering to cells that are no longer within any active range.
3. THE Fog_of_War system SHALL only suppress fog for the currently active (selected) Ship's ranges — fog around non-active friendly ships SHALL remain governed by the standard `visionRadius` fog rules.
4. THE Fog_of_War system SHALL re-evaluate fog suppression whenever the active Ship's position or `movesRemaining` changes.

### Requirement 12: Movement Range Highlight

**User Story:** As a player, I want a distinct magenta-colored highlight showing which cells my active ship can reach based on remaining movement points, so that I can plan movement separately from vision and attack ranges.

#### Acceptance Criteria

1. THE Range_Highlight system SHALL maintain a fourth InstancedMesh pool for Movement_Range highlights, using magenta color (`0xFF00FF`), opacity 0.35, with `depthWrite: false` and `depthTest: false`.
2. WHEN a Ship is selected as the active Ship, THE Range_Highlight system SHALL display Movement_Range highlights on all cells reachable based on the Ship's `movesRemaining` and Move_Cost, using Minimum_Segment_Distance from the Ship's Occupied_Segments.
3. WHEN the active Ship has `movesRemaining` equal to 0, THE Range_Highlight system SHALL display zero Movement_Range highlight cells.
4. THE Range_Highlight system SHALL render Movement_Range highlights at a Y-offset of 0.2 (same as the existing move highlight) and with `renderOrder` higher than vision and attack highlights to ensure visibility.
5. WHEN the active Ship moves or expends movement points, THE Range_Highlight system SHALL rebuild the Movement_Range highlight to reflect the updated `movesRemaining`.
