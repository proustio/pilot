# Changes Tasks — Rogue Mode (9)

> Reference: `docs/change-summary-9.md`  
> Codebase context: `src/` (DDD layering, Three.js + TypeScript, Vite)

---

## 9. Rogue Mode

> **Scope note**: Items are sequenced by dependency. Start with domain/application changes before presentation work.

---

### 9.1 — Add `Rogue` to `MatchMode` Enum + Domain Types

**Files:**
- `src/domain/match/Match.ts`
- `src/domain/fleet/Ship.ts`
- `src/infrastructure/config/Config.ts`

- [x] **Add `Rogue = 'rogue'`** to `MatchMode` enum in `Match.ts`.
- [x] **Update `getRequiredFleet()`** to return a Rogue fleet (same as Classic for now).
- [x] **Add movement fields to `Ship`**:
  - `public movesRemaining: number = 0`
  - `public hasActedThisTurn: boolean = false`
  - `public readonly maxMoves: number` — computed as `5 - ship.size` in the constructor.
- [x] **Add `rogue` block to `Config.ts`**:
  ```ts
  rogue: {
    fogRadius: 7,  // cells of personal fog halo around each ship
  }
  ```
- [x] **Acceptance**: `MatchMode.Rogue` compiles without errors; `Ship` carries movement state fields.

---

### 9.2 — Single-Side ("Same Board") Placement

**Files:**
- `src/domain/match/Match.ts`
- `src/application/game-loop/GameLoop.ts`

- [x] **In `Match`**: When `mode === MatchMode.Rogue`, both player and enemy fleets are placed on `playerBoard`. Add a getter `public get sharedBoard(): Board` returning `playerBoard` in Rogue mode.
- [x] **In `GameLoop.startNewMatch()`**: Add a Rogue branch that places enemy ships on `playerBoard` (same grid as the player's ships, non-overlapping). Note that the board size in Rogue mode is 20×20.
- [x] **In `GameLoop.onGridClick()` during `SETUP_BOARD`**: After all player ships are placed in Rogue mode, trigger a second placement phase for enemy ships on the same board.
- [x] **Acceptance**: In Rogue mode, both fleets share a 20×20 grid and all ships are visible at game start.

---

### 9.3 — Ship-Tethered Dynamic Fog of War

**Files:**
- `src/presentation/3d/entities/FogManager.ts`
- `src/presentation/3d/entities/EntityManager.ts`

> In Rogue mode, fog wraps each ship at a 7-cell radius instead of covering all enemy cells statically.

- [x] **Add `rogueMode: boolean` flag to `FogManager`** (passed from `Config`).
- [x] **In Rogue mode, skip per-cell static fog creation** in `BoardBuilder.build()`.
- [x] **Create `updateRogueFog(ships: Ship[])` method**:
  - For each cell on the board, compute the minimum Chebyshev distance to any ship cell.
  - If `distance <= Config.rogue.fogRadius`, hide fog mesh (fade out opacity).
  - If `distance > Config.rogue.fogRadius`, show fog mesh (fade in).
  - Animate opacity smoothly using lerp over ~20 frames.
- [x] **Call `updateRogueFog(ships)` every frame** in `EntityManager.update()` when `rogueMode` is active.
- [x] **When a ship moves**, call `updateRogueFog()` immediately to recompute revealed cells.
- [x] **Acceptance**: Fog clouds appear and disappear dynamically at a 7-cell radius around each ship as they move.

---

### 9.4 — Ship Movement Mechanics

**Files:**
- `src/domain/board/Board.ts`
- `src/domain/fleet/Ship.ts`
- `src/domain/match/Match.ts`
- `src/application/game-loop/GameLoop.ts`
- `src/presentation/3d/entities/EntityManager.ts`

- [x] **`Board.moveShip(ship, newHeadX, newHeadZ, newOrientation): boolean`**:
  - Validates the new position doesn't collide with other ships or exceed board bounds.
  - Clears old ship cells in `gridState`, writes new cells.
  - Updates `ship.headX`, `ship.headZ`, `ship.orientation`.
  - Returns `true` on success, `false` on invalid.
- [x] **`Ship.resetTurnAction()`**: Resets `hasActedThisTurn = false` and `movesRemaining = maxMoves`.
- [x] **Add `ROGUE_MOVE_SHIP` CustomEvent handler in `GameLoop`**:
  - Payload: `{ shipId, newX, newZ, newOrientation }`.
  - Validates `ship.movesRemaining > 0 && !ship.hasActedThisTurn`.
  - Calls `match.playerBoard.moveShip(...)`.
  - Decrements `ship.movesRemaining`, sets `ship.hasActedThisTurn = true`.
  - Fires `shipMovedListeners` for the presentation layer.
- [x] **`EntityManager.moveShip3D(ship)`**: Smoothly translates the ship's `THREE.Group` to new board coordinates via lerp in `update()`.
- [x] **Acceptance**: Player can select a ship and move it up to `5 - size` cells per turn in Rogue mode.

---

### 9.5 — Per-Ship Turn Rotation (Smallest First)

**Files:**
- `src/application/game-loop/GameLoop.ts`

- [ ] **Add `activeRogueShipIndex: number`** to `GameLoop`.
- [ ] **Sort the active fleet by size ascending** at match start; store as `rogueShipOrder: Ship[]`.
- [ ] **In Rogue mode, `PLAYER_TURN` means acting with the current active ship** (move, attack, or skip — not free-targeting).
- [ ] **After a ship acts**, advance `activeRogueShipIndex` to the next ship in `rogueShipOrder`.
- [ ] **When all ships have acted**, transition to `ENEMY_TURN`; AI cycles through its ships similarly.
- [ ] **Reset all `hasActedThisTurn` flags** and `movesRemaining` at the start of each full player turn (call `ship.resetTurnAction()` for all ships).
- [ ] **Emit `ACTIVE_SHIP_CHANGED` CustomEvent** with `{ ship }` payload whenever the active ship changes.
- [ ] **Acceptance**: Ships are cycled smallest→largest each player turn; once all act, enemy turn begins.

---

### 9.6 — Alternative Attack Types

> The advanced arsenal should be fully implemented from the start of this sprint rather than just stubbed.

- [ ] **Define `WeaponType` enum**: `Cannon` (existing), `Mine`, `Sonar`, `AirStrike`.
- [ ] **Implement methods in `Board`**:
  - `placeMine(x, z): boolean` — logic to mark cell as `CellState.Mine` and handle triggering when a ship enters the cell.
  - `sonarPing(centerX, centerZ, radius): { x, z }[]` — functional scanning logic returning occupied cells.
  - `dispatchAirStrike(startX, startZ, directionX: -1|0|1, directionZ: -1|0|1): AttackResult[]` — full implementation of line attack logic.
- [ ] **Add `ROGUE_USE_WEAPON` handler in `GameLoop`**: Routes to the appropriate `Board` implementation, processes state changes, and signals the presentation layer.
- [ ] **Acceptance**: All advanced weapons (mines, sonar, air strikes) are fully implemented and affect gameplay correctly instead of returning stub results.

---

### 9.7 — Rogue Mode UI Plumbing

**Files:**
- `src/presentation/ui/menu/MainMenu.ts`
- `src/presentation/ui/hud/HUD.ts`
- `src/presentation/ui/hud/HUDControls.ts`
- `src/presentation/ui/UIManager.ts`
- `src/styles/*.css`

- [ ] **Unlock Rogue in `MainMenu`**: The existing Rogue dropdown entry is disabled — wire it to set `MatchMode.Rogue` when starting a new game (fire it via the existing mode-selection event).
- [ ] **In `HUD.ts`**: Listen to `ACTIVE_SHIP_CHANGED`; display the active ship's name and remaining move count in the turn indicator panel.
- [ ] **Add a Rogue action bar**: Minimal HTML injected by `HUD.ts` with three buttons — **Move**, **Attack**, **Skip** — visible only in Rogue mode. Buttons disable once the active ship has acted.
- [ ] **Acceptance**: Rogue is selectable from the main menu and the HUD correctly tracks and displays the active ship.
