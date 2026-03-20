# Changes Tasks — Sprint 8

> Reference: `docs/changes-summary-8.md`  
> Codebase context: `src/` (DDD layering, Three.js + TypeScript, Vite)

---

## 1. Visual Adjustments

### 1.1 — Thicker, Lower Fog of War

**Files:** `src/presentation/3d/entities/EntityManager.ts`

- [ ] **Increase fog voxel density**: In `createBoardMeshes()`, raise `numVoxels` per fog cloud from `100` to at least `200–250`.
- [ ] **Raise fog Y spread**: Change the `vy` spread from `(Math.random() - 0.5) * 0.4` to at least `(Math.random() - 0.5) * 0.9` so the cloud stands taller.
- [ ] **Lower fog cloud position**: Change `fogCloud.position.set(worldX, 0.2, worldZ)` to `fogCloud.position.set(worldX, 0.0, worldZ)` (or slightly negative) so the cloud sits closer to/at water-surface level.
- [ ] **Increase fog opacity & emissive**: In `fogMat`, bump `opacity` from `0.6` → `0.85` and `emissiveIntensity` from `0.6` → `1.0` to make the fog visually denser.
- [ ] **Acceptance**: Fog should visually obscure ships from the default camera angle without requiring a top-down view.

---

### 1.2 — Burning Flame on Hidden Hit Segments

**Files:**
- `src/presentation/3d/entities/EntityManager.ts`
- `src/presentation/3d/entities/ParticleSystem.ts`

- [ ] **Track hit segment info on fog meshes**: When `applyImpactEffects()` processes a hit/sunk on the enemy board, store `{ hitCount }` in the corresponding `fogMeshes[idx].userData` so the flame can scale with damage.
- [ ] **Create a `spawnFogFlame()` method in `ParticleSystem`**: A small, continuous looping particle emitter (orange/red voxels, small scale `0.04–0.08`, upward Y drift, fast fade-out, 10–15 particles). The emitter should live as long as the fog mesh exists.
  - Internally track `activeFogFlames: { mesh: THREE.InstancedMesh, fogIdx: number, intensity: number }[]`.
  - Each frame in `ParticleSystem.update()`, re-emit particles from live flame sources.
- [ ] **Spawn flame on fog mesh on hit**: In the projectile landing block (`m.result === 'hit' || 'sunk'`), if the fog mesh at `fogIdx` is still present, call `particleSystem.spawnFogFlame(worldX, 0.2, worldZ, hitCount)`.
- [ ] **Scale flame intensity with damage**: `hitCount` should multiply particle count and emissive brightness.
- [ ] **Clean up flame on fog removal**: When `clearFogCell()` or the projectile landing removes a fog mesh, call `particleSystem.removeFogFlame(fogIdx)` to stop that emitter.
- [ ] **Acceptance**: After hitting a fog-covered cell, a small flame is visible through/above the fog cloud, growing visibly with each additional hit on the same ship.

---

### 1.3 — Authentic Ship-Kill Explosion Sound

**Files:** `src/infrastructure/audio/AudioEngine.ts`

- [ ] **Redesign `playKill()`** using layered Web Audio API nodes to approximate a real naval explosion:
  1. **Low-frequency boom**: White noise burst through a lowpass filter (cutoff ~120 Hz), `duration: 1.2s`, fade from `1.0` to `0`.
  2. **Mid shockwave**: Sine tone starting at `80 Hz` dropping to `20 Hz` over `0.5s`, high gain.
  3. **High crackle**: Short white noise burst (cutoff ~4000 Hz bandpass), `0.3s`, appearing ~`50ms` after the initial boom via `setTimeout`.
  4. **Rumble tail**: Lowpass noise at ~`300 Hz`, long fade `1.5s`, quieter (`volStart: 0.3`).
- [ ] All layers must respect `this.masterVolume`.
- [ ] **Acceptance**: Kill sound is clearly more impactful and authentic than the current sawtooth-oscillator approximation.

---

## 2. Rogue Mode

> **Scope note**: Items are sequenced by dependency. Start with domain/application changes before presentation work.

---

### 2.1 — Add `Rogue` to `MatchMode` Enum + Domain Types

**Files:**
- `src/domain/match/Match.ts`
- `src/domain/fleet/Ship.ts`
- `src/infrastructure/config/Config.ts`

- [ ] **Add `Rogue = 'rogue'`** to `MatchMode` enum in `Match.ts`.
- [ ] **Update `getRequiredFleet()`** to return a Rogue fleet (same as Classic for now).
- [ ] **Add movement fields to `Ship`**:
  - `public movesRemaining: number = 0`
  - `public hasActedThisTurn: boolean = false`
  - `public readonly maxMoves: number` — computed as `5 - ship.size` in the constructor.
- [ ] **Add `rogue` block to `Config.ts`**:
  ```ts
  rogue: {
    fogRadius: 7,  // cells of personal fog halo around each ship
  }
  ```
- [ ] **Acceptance**: `MatchMode.Rogue` compiles without errors; `Ship` carries movement state fields.

---

### 2.2 — Single-Side ("Same Board") Placement

**Files:**
- `src/domain/match/Match.ts`
- `src/application/game-loop/GameLoop.ts`

- [ ] **In `Match`**: When `mode === MatchMode.Rogue`, both player and enemy fleets are placed on `playerBoard`. Add a getter `public get sharedBoard(): Board` returning `playerBoard` in Rogue mode.
- [ ] **In `GameLoop.startNewMatch()`**: Add a Rogue branch that places enemy ships on `playerBoard` (same grid as the player's ships, non-overlapping).
- [ ] **In `GameLoop.onGridClick()` during `SETUP_BOARD`**: After all player ships are placed in Rogue mode, trigger a second placement phase for enemy ships on the same board.
- [ ] **Acceptance**: In Rogue mode, both fleets share a 10×10 grid and all ships are visible at game start.

---

### 2.3 — Ship-Tethered Dynamic Fog of War

**Files:**
- `src/presentation/3d/entities/EntityManager.ts`

> In Rogue mode, fog wraps each ship at a 7-cell radius instead of covering all enemy cells statically.

- [ ] **Add `rogueMode: boolean` flag to `EntityManager`** (passed from `Config`).
- [ ] **In Rogue mode, skip per-cell static fog creation** in `createBoardMeshes()`.
- [ ] **Create `updateRogueFog(ships: Ship[])` method**:
  - For each cell on the board, compute the minimum Chebyshev distance to any ship cell.
  - If `distance <= Config.rogue.fogRadius`, hide fog mesh (fade out opacity).
  - If `distance > Config.rogue.fogRadius`, show fog mesh (fade in).
  - Animate opacity smoothly using lerp over ~20 frames.
- [ ] **Call `updateRogueFog(ships)` every frame** in `EntityManager.update()` when `rogueMode` is active.
- [ ] **When a ship moves**, call `updateRogueFog()` immediately to recompute revealed cells.
- [ ] **Acceptance**: Fog clouds appear and disappear dynamically at a 7-cell radius around each ship as they move.

---

### 2.4 — Ship Movement Mechanics

**Files:**
- `src/domain/board/Board.ts`
- `src/domain/fleet/Ship.ts`
- `src/domain/match/Match.ts`
- `src/application/game-loop/GameLoop.ts`
- `src/presentation/3d/entities/EntityManager.ts`

- [ ] **`Board.moveShip(ship, newHeadX, newHeadZ, newOrientation): boolean`**:
  - Validates the new position doesn't collide with other ships or exceed board bounds.
  - Clears old ship cells in `gridState`, writes new cells.
  - Updates `ship.headX`, `ship.headZ`, `ship.orientation`.
  - Returns `true` on success, `false` on invalid.
- [ ] **`Ship.resetTurnAction()`**: Resets `hasActedThisTurn = false` and `movesRemaining = maxMoves`.
- [ ] **Add `ROGUE_MOVE_SHIP` CustomEvent handler in `GameLoop`**:
  - Payload: `{ shipId, newX, newZ, newOrientation }`.
  - Validates `ship.movesRemaining > 0 && !ship.hasActedThisTurn`.
  - Calls `match.playerBoard.moveShip(...)`.
  - Decrements `ship.movesRemaining`, sets `ship.hasActedThisTurn = true`.
  - Fires `shipMovedListeners` for the presentation layer.
- [ ] **`EntityManager.moveShip3D(ship)`**: Smoothly translates the ship's `THREE.Group` to new board coordinates via lerp in `update()`.
- [ ] **Acceptance**: Player can select a ship and move it up to `5 - size` cells per turn in Rogue mode.

---

### 2.5 — Per-Ship Turn Rotation (Smallest First)

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

### 2.6 — Alternative Attack Types (Domain Stubs)

**Files:**
- `src/domain/board/Board.ts`
- `src/domain/match/Match.ts`
- `src/application/game-loop/GameLoop.ts`

> Full implementation is a future sprint. Stub the domain API now to lock down the architecture.

- [ ] **Define `WeaponType` enum**: `Cannon` (existing), `Mine`, `Sonar`, `Warplane`, `Ram`.
- [ ] **Add stub methods to `Board`**:
  - `placeMine(x, z): boolean` — marks cell as `CellState.Mine` (add new enum value).
  - `sonarPing(centerX, centerZ, radius): { x, z }[]` — returns occupied cells in radius (read-only, no state change).
  - `dispatchWarplane(startX, startZ, directionX: -1|0|1, directionZ: -1|0|1): AttackResult[]` — attacks a line of cells.
  - `ram(attackerShip: Ship, targetX, targetZ): AttackResult` — collision damage to a single cell.
- [ ] **Add `ROGUE_USE_WEAPON` handler in `GameLoop`**: Routes to the appropriate `Board` stub and logs result to console.
- [ ] **Acceptance**: All methods compile and return stub results without runtime errors.

---

### 2.7 — Rogue Mode UI Plumbing

**Files:**
- `src/presentation/ui/menu/MainMenu.ts`
- `src/presentation/ui/hud/HUD.ts`
- `src/presentation/ui/UIManager.ts`
- `src/style.css`

- [ ] **Unlock Rogue in `MainMenu`**: The existing Rogue dropdown entry is disabled — wire it to set `MatchMode.Rogue` when starting a new game (fire it via the existing mode-selection event).
- [ ] **In `HUD.ts`**: Listen to `ACTIVE_SHIP_CHANGED`; display the active ship's name and remaining move count in the turn indicator panel.
- [ ] **Add a Rogue action bar**: Minimal HTML injected by `HUD.ts` with three buttons — **Move**, **Attack**, **Skip** — visible only in Rogue mode. Buttons disable once the active ship has acted.
- [ ] **Acceptance**: Rogue is selectable from the main menu and the HUD correctly tracks and displays the active ship.

---

## 3. Multiplayer PvP

> **Scope note**: Scaffolding only this sprint. No backend server is required to complete these items.

---

### 3.1 — Networking Layer Scaffold

**New files:**
- `src/infrastructure/network/INetworkAdapter.ts`
- `src/infrastructure/network/WebSocketAdapter.ts`

- [ ] **Define `INetworkAdapter` interface**:
  ```ts
  interface INetworkAdapter {
    connect(serverUrl: string): Promise<void>;
    send(event: string, payload: unknown): void;
    onMessage(handler: (event: string, payload: unknown) => void): void;
    disconnect(): void;
  }
  ```
- [ ] **Implement `WebSocketAdapter`** using the native browser `WebSocket` API conforming to the interface above.
- [ ] **Acceptance**: `WebSocketAdapter` connects to a local echo server and successfully round-trips a JSON test message.

---

### 3.2 — Game State Sync Manager

**New file:** `src/infrastructure/network/SyncManager.ts`

- [ ] **`SyncManager`** wraps `INetworkAdapter` and bridges game events to network messages:
  - **Outbound**: Subscribes to `ATTACK_RESULT`, `SHIP_PLACED`, `ROGUE_MOVE_SHIP` on `document`; serializes to JSON and calls `adapter.send()`.
  - **Inbound**: On `adapter.onMessage()`, deserializes and re-dispatches as `CustomEvent` on `document`.
- [ ] **Turn authority protocol stub**: Document (as JSDoc) the intended server-as-authoritative approach — clients send "intent"; server confirms and rebroadcasts.
- [ ] **Acceptance**: Two browser tabs connected to a local Node echo server can exchange attack events via `SyncManager`.

---

### 3.3 — Lobby & Invite UI

**New file:** `src/presentation/ui/menu/LobbyMenu.ts`  
**Modified:** `src/style.css`, `src/presentation/ui/UIManager.ts`

- [ ] **`LobbyMenu`** (extends `BaseUIComponent`), rendered in `#ui-layer`:
  - "Create Room" button — generates a short room code (UUID prefix) and displays it.
  - "Join Room" input + button — accepts a room code entered by the user.
  - Player slots list (2 entries; shows "Waiting…" until both players connect).
  - "Start Game" button — enabled only when `playerCount === 2`.
- [ ] **Style**: Follow the retro industrial aesthetic from `style.css` (use existing CSS variables and component patterns).
- [ ] **Add `LOBBY` to `GameState` enum** in `GameLoop.ts`; show `LobbyMenu` via `UIManager` when state is `LOBBY`.
- [ ] **Wire "Multiplayer" option in `MainMenu`** to transition to `GameState.LOBBY`.
- [ ] **Acceptance**: Lobby screen renders correctly and invite-code controls are functional UI-side (no backend required).

---

## Priority Order

| # | Task | Effort | Dependencies |
|---|------|--------|-------------|
| 1 | 1.1 Fog thickness & height | XS | — |
| 2 | 1.3 Kill sound redesign | XS | — |
| 3 | 1.2 Burning hit-segment flames | S | 1.1 |
| 4 | 2.1 Rogue domain types | S | — |
| 5 | 2.6 Alternative weapon stubs | S | 2.1 |
| 6 | 2.5 Per-ship turn rotation | S | 2.1 |
| 7 | 2.4 Ship movement mechanics | M | 2.1 |
| 8 | 2.2 Single-side placement | M | 2.1 |
| 9 | 2.3 Ship-tethered fog | M | 2.2, 2.4 |
| 10 | 2.7 Rogue mode UI | S | 2.5, 2.6 |
| 11 | 3.1 Network adapter scaffold | M | — |
| 12 | 3.2 Sync manager | M | 3.1 |
| 13 | 3.3 Lobby UI | M | 3.1 |
