# Changes Tasks — Sprint 8

> Reference: `docs/changes-summary-8.md`  
> Codebase context: `src/` (DDD layering, Three.js + TypeScript, Vite)

---

## 0. Prerequisite — Decompose Large Files

> **Rationale**: Several files have grown past 500 lines and mix unrelated responsibilities. Splitting them now reduces merge conflicts and makes the Sprint 8 feature work cleaner.

---

### 0.1 — Decompose `GameLoop.ts` (505 → ~3 files)

**Current structure** (single class, 505 lines):
| Responsibility | Lines | Target file |
|---|---|---|
| State machine, enums, listener registration, transitionTo | 1-191 | `GameLoop.ts` (keep, ~190 lines) |
| Match init, loading, ship/attack replay | 193-305 | `MatchSetup.ts` (~115 lines) |
| Turn execution (enemy, auto-player, onGridClick) | 307-505 | `TurnExecutor.ts` (~200 lines) |

**Files:**
- `src/application/game-loop/GameLoop.ts`
- `src/application/game-loop/MatchSetup.ts` [NEW]
- `src/application/game-loop/TurnExecutor.ts` [NEW]

- [v] **Create `MatchSetup.ts`** — extract `startNewMatch()`, `loadMatch()`, `replayShips()`, `replayAttacks()` into a standalone class or set of functions that accept `Match`, listener arrays, and AI engines as parameters.
- [v] **Create `TurnExecutor.ts`** — extract `handleEnemyTurn()`, `handleAutoPlayerTurn()`, and the `PLAYER_TURN` / `SETUP_BOARD` branch of `onGridClick()` into a class that receives the GameLoop state it needs (match, isAnimating, isPaused, listeners, AI engines) via constructor injection.
- [v] **Slim `GameLoop.ts`** — keep only: `GameState` enum, type aliases, constructor (event listeners), `transitionTo()`, listener registration methods, `triggerAutoSave()`, `hasUnsavedProgress()`. Delegate to `MatchSetup` and `TurnExecutor` internally.
- [v] **Update existing tests** — `GameLoop.preservation.test.ts` and `GameLoop.replayAttacks.test.ts` should pass without changes (public API unchanged).
- [v] **Acceptance**: `npm run dev` compiles cleanly; existing tests pass; `GameLoop` public API signature unchanged.

---

### 0.2 — Decompose `ProjectileManager.ts` (521 → 2 files)

**Current structure** (single class, 521 lines):
| Responsibility | Lines | Target file |
|---|---|---|
| Marker creation + bezier arc + update loop | 1-300 | `ProjectileManager.ts` (keep, ~300 lines) |
| Impact effects, voxel destruction, sinking, persistent fire, ship breaking | 302-521 | `ImpactEffects.ts` (~220 lines) |

**Files:**
- `src/presentation/3d/entities/ProjectileManager.ts`
- `src/presentation/3d/entities/ImpactEffects.ts` [NEW]

- [v] **Create `ImpactEffects.ts`** — extract `applyImpactEffects()`, `addPersistentFireToShipCell()`, and `splitShipForBreaking()` into a new `ImpactEffects` class. It receives `ParticleSystem`, board-group refs, and `Config` via constructor.
- [v] **Slim `ProjectileManager.ts`** — keep marker construction (`addAttackMarker`), arc animation (`updateProjectiles`), and `FallingMarker` interface. Call `ImpactEffects` methods where needed.
- [v] **Acceptance**: `npm run dev` compiles cleanly; attack, hit, sunk, and replay visuals work identically.

---

### 0.3 — Decompose `HUD.ts` (468 → 3 files)

**Current structure** (single class, 468 lines):
| Responsibility | Lines | Target file |
|---|---|---|
| Core class, render template, mount, update | 1-52, 370-468 | `HUD.ts` (keep, ~170 lines) |
| Switch/button wiring, LED toggling, event binding | 188-367 | `HUDControls.ts` (~180 lines) |
| updateCounters, updateStats, win-probability | 393-462 | `HUDStats.ts` (~70 lines) |

**Files:**
- `src/presentation/ui/hud/HUD.ts`
- `src/presentation/ui/hud/HUDControls.ts` [NEW]
- `src/presentation/ui/hud/HUDStats.ts` [NEW]

- [v] **Create `HUDControls.ts`** — export a function `bindHUDControls(container: HTMLElement)` that wires all switchboard button handlers (peek, geek-stats, auto-battler, day/night, cam-reset, speed, FPS, settings, mouse-coords). Returns cleanup handle if needed.
- [v] **Create `HUDStats.ts`** — export helper functions `renderFleetIcons(container, ships)`, `updateGameStats(container, match)`, and `calculateWinProbability(playerBoard, enemyBoard)`.
- [v] **Slim `HUD.ts`** — keep render template, `mount()`, `update()`, and delegate to `HUDControls.bindHUDControls()` and `HUDStats` helpers.
- [v] **Acceptance**: `npm run dev` compiles cleanly; all HUD buttons, LEDs, stat displays function identically.

---

### 0.4 — Modularize `style.css` (1599 → 5 files + barrel)

**Current structure** (single file, 1599 lines):
| Section | Lines | Target file |
|---|---|---|
| Theme variables (day/night), base body/canvas/ui-layer | 1-214 | `styles/theme.css` |
| Shared components (voxel-panel, retro-panel, voxel-btn, voxel-select) | 216-349 | `styles/components.css` |
| Custom dropdown + MTG card + retro console + engage btn | 350-763 | `styles/main-menu.css` |
| HUD layout, turn indicator, fleet, mini-board, stats, switchboard, geek stats | 764-1403 | `styles/hud.css` |
| Save/Load dialog, confirmations, settings, pause, sliders, mouse coords | 1404-1600 | `styles/dialogs.css` |

**Strategy**: Vite natively resolves CSS `@import` at build time, so no runtime cost.

**Files:**
- `src/styles/theme.css` [NEW]
- `src/styles/components.css` [NEW]
- `src/styles/main-menu.css` [NEW]
- `src/styles/hud.css` [NEW]
- `src/styles/dialogs.css` [NEW]
- `src/style.css` [MODIFY] — becomes a ~6-line barrel:
  ```css
  @import './styles/theme.css';
  @import './styles/components.css';
  @import './styles/main-menu.css';
  @import './styles/hud.css';
  @import './styles/dialogs.css';
  ```

- [x] **Create `src/styles/` directory** and the five CSS files by moving the corresponding sections.
- [x] **Replace `src/style.css` contents** with the `@import` barrel shown above.
- [x] **No import path changes needed** — `index.html` still loads `src/style.css`; Vite inlines the imports at build time.
- [x] **Acceptance**: `npm run dev` compiles cleanly; all visuals and responsive behavior are identical across both day and night modes. Verify by toggling day/night, opening settings, save/load dialog, and checking HUD switchboard.

---


## 1. Visual Adjustments


### 1.1 — Thicker, Lower Fog of War

**Files:** `src/presentation/3d/entities/BoardBuilder.ts`

- [x] **Increase fog voxel density**: In `BoardBuilder.build()`, raise `numVoxels` per fog cloud from `100` to at least `200–250`.
- [x] **Raise fog Y spread**: Change the `vy` spread from `(Math.random() - 0.5) * 0.4` to at least `(Math.random() - 0.5) * 0.9` so the cloud stands taller.
- [x] **Lower fog cloud position**: Change `fogCloud.position.set(worldX, 0.2, worldZ)` to `fogCloud.position.set(worldX, 0.0, worldZ)` (or slightly negative) so the cloud sits closer to/at water-surface level.
- [x] **Increase fog opacity & emissive**: In `fogMat`, bump `opacity` from `0.6` → `0.85` and `emissiveIntensity` from `0.6` → `1.0` to make the fog visually denser.
- [x] **Acceptance**: Fog should visually obscure ships from the default camera angle without requiring a top-down view.

---

### 1.2 — Persistent Flames on Hit Cells

**Files:**
- `src/presentation/3d/entities/ImpactEffects.ts`
- `src/presentation/3d/entities/ParticleSystem.ts`

- [x] **Apply persistent fire to hit cell**: In `ImpactEffects.applyImpactEffects()`, ensure a fire/smoke emitter is added to the board group (`enemyBoardGroup` or `playerBoardGroup`) at the hit cell's world coordinates.
- [x] **Ensure permanence**: These emitters should remain active until the end of the match (no cleanup on fog removal).
- [x] **Acceptance**: Every hit on the board is marked by a persistent flame/smoke effect that stays in place regardless of fog or ship state.

---

### 1.3 — Authentic Ship-Kill Explosion Sound

**Files:** `src/infrastructure/audio/AudioEngine.ts`

- [x] **Redesign `playKill()`** using layered Web Audio API nodes to approximate a real naval explosion:
  1. **Low-frequency boom**: White noise burst through a lowpass filter (cutoff ~120 Hz), `duration: 1.2s`, fade from `1.0` to `0`.
  2. **Mid shockwave**: Sine tone starting at `80 Hz` dropping to `20 Hz` over `0.5s`, high gain.
  3. **High crackle**: Short white noise burst (cutoff ~4000 Hz bandpass), `0.3s`, appearing ~`50ms` after the initial boom via `setTimeout`.
  4. **Rumble tail**: Lowpass noise at ~`300 Hz`, long fade `1.5s`, quieter (`volStart: 0.3`).
- [x] All layers must respect `this.masterVolume`.
- [x] **Acceptance**: Kill sound is clearly more impactful and authentic than the current sawtooth-oscillator approximation.

---

---

## Priority Order

| # | Task | Effort | Dependencies |
|---|------|--------|-------------|
| 0a | 0.1 Decompose GameLoop.ts | S | — |
| 0b | 0.2 Decompose ProjectileManager.ts | S | — |
| 0c | 0.3 Decompose HUD.ts | S | — |
| 0d | 0.4 Modularize style.css | S | — |
| 1 | 1.1 Fog thickness & height | XS | 0b (touches EntityManager, adjacent) |
| 2 | 1.3 Kill sound redesign | XS | — |
| 3 | 1.2 Burning hit-segment flames | S | 1 |

> [!NOTE]
> Rogue Mode (9) and Multiplayer PvP (10) have been moved to their own dedicated task files: `docs/change-task-9.md` and `docs/change-task-10.md`.
