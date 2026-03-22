# Rogue Mode Enhancements

We are transitioning Rogue mode from a basic movement test to a feature-complete tactical experience. This includes strategic placement limits, fog-of-war based on unit vision, and a redesign of the ability system to nest utilities under movement.

## Proposed Changes

### Domain Layer

#### [MODIFY] [Match.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/domain/match/Match.ts)
- Update [validatePlacement](file:///Users/alx/code/repos/praust/2-battlehsips/src/domain/match/Match.ts#51-88) for Rogue mode:
    - If `ship.isEnemy` is false (player), headZ must be >= 10 (Southern 10x10 of a 20x20 board).
    - If `ship.isEnemy` is true (AI), headZ must be < 10 (Northern 10x10).
- Add `resources` tracking (Air Strike: 1, Sonars: 2, Mines: 5).
- Update placement to be on the **same board side** (Player Board) for both teams in Rogue mode.

#### [MODIFY] [Ship.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/domain/fleet/Ship.ts)
- Add `visionRadius` property: `this.size * 2`.

---

### Application Layer

#### [MODIFY] [GameLoop.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/application/game-loop/GameLoop.ts)
- Implement `ROGUE_USE_ABILITY` listener to handle Sonar/Mine placement.
- Update `ROGUE_ATTEMPT_MOVE` to potentially trigger random ability dispersal along the path if an ability is "queued".
- Implement resource deduction and validation.

#### [MODIFY] [AIEngine.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/application/ai/AIEngine.ts)
- Update AI placement logic to respect the Northern 10x10 boundary in Rogue mode.

---

### Presentation Layer (3D)

#### [MODIFY] [ShipFactory.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/3d/entities/ShipFactory.ts)
- Adjust `hullColor` or add a specific accent glow to distinguish Player vs Enemy ships in Rogue mode.

#### [MODIFY] [FogManager.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/3d/entities/FogManager.ts)
- Update [updateRogueFog](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/3d/entities/FogManager.ts#74-151) to only use `playerShips` (and buoys) for revealing fog, rather than all ships.
- Ensure enemy ships are only revealed if within the calculated vision radius.

#### [MODIFY] [InteractionManager.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/3d/interaction/InteractionManager.ts)
- Update [rebuildMoveHighlight](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/3d/interaction/InteractionManager.ts#369-401) to show Ship Systems (Sonar/Mine) highlights if they are the "sub-action" of Move.
- Refine [onMouseClick](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/3d/interaction/InteractionManager.ts#149-182) to play the error sound for invalid Rogue actions (out of bounds move, attacking hit cells).

---

### Presentation Layer (UI)

- Redesign the "Ship Systems" panel to be nested or activated via the "Move" button.
- Add resource counters (e.g., "SONAR (2/2)") to the buttons.
- Update the bottom-right ship count status to reflect Rogue mode's shared board.
- **Remove the "PEEK" button** in Rogue mode.

#### [MODIFY] [UnifiedBoardUI.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/hud/UnifiedBoardUI.ts)
- Sync minimap highlighting with the new "Ability" modes.
- Implement fog of war on the minimap grid.

## Verification Plan

### Automated Tests
- No existing automated tests for Rogue mode logic found. I will rely on manual verification via the browser.

### Manual Verification
1. **Placement Limits**:
    - Start a Rogue game.
    - Try to place a ship in the middle or top half of the board. It should be blocked (red ghost).
    - Verify AI ships are placed in the top 10 rows.
2. **Fog of War**:
    - Confirm enemy vessels are invisible until a player ship moves within `visionRadius` (ship length * 2).
    - Confirm the minimap reflects this same visibility.
3. **Nested Abilities**:
    - Select "Move". Select "Sonar".
    - Verify clicking a valid move destination also "drops" a sonar along the path.
4. **Resource Limits**:
    - Use all 2 sonars.
    - Verify the button becomes disabled and cannot be used again.
5. **Visual Distinction**:
    - Hover over an enemy ship vs player ship; confirm they look visually distinct (e.g., Red vs Blue accents).
