# Prerequisite Tasks

> Architecture prerequisites to complete before Rogue (9) and PvP (10) work begins.

---

## P.1 — Inject Config & Storage via Constructor (DI Refactor)

**Goal**: `application/` must not static-import from `infrastructure/`. `main.ts` passes `Config` and `Storage` into `GameLoop` via constructor.

**Files:**
- `src/application/game-loop/GameLoop.ts`
- `src/application/game-loop/TurnExecutor.ts`
- `src/application/game-loop/MatchSetup.ts`
- `src/main.ts`

- [ ] **`GameLoop` constructor**: Accept `config: typeof Config` and `storage: typeof Storage` as params. Store as `private config` and `private storage`. Remove top-level `import { Config }` and `import { Storage }`.
- [ ] **Replace all static references** in `GameLoop.ts`:
  - `Config.aiDifficulty` → `this.config.aiDifficulty`
  - `Config.autoBattler` → `this.config.autoBattler`
  - `Config.timing.*` → `this.config.timing.*`
  - `Storage.saveGame(...)` → `this.storage.saveGame(...)`
  - `Storage.loadGame(...)` → `this.storage.loadGame(...)`
  - `Storage.clearSession()` → `this.storage.clearSession()`
- [ ] **`TurnExecutorState` interface**: Add `config` field. `TurnExecutor` reads config from `this.s.config` instead of importing `Config` directly. Remove top-level Config import.
- [ ] **`MatchSetupState` interface**: Add `config` field. `MatchSetup` reads config from `this.state.config` instead of importing `Config` directly. Remove top-level Config import.
- [ ] **`main.ts`**: Update `new GameLoop()` → `new GameLoop(Config, Storage)`.
- [ ] **Update tests**: `application/game-loop/__tests__/GameLoop.preservation.test.ts` and `GameLoop.replayAttacks.test.ts` — pass `Config` and `Storage` into `GameLoop` constructor.
- [ ] **Acceptance**: `npm run build` passes. `npm run test` passes. No `infrastructure/` imports remain in `application/`.

---

## P.2 — Rendering Performance Optimization (Max FPS)

**Goal**: Squeeze maximum FPS out of the Three.js rendering pipeline. Changes are tiered by impact-to-effort ratio, with tradeoffs documented for each.

---

### P.2.1 — Fog Animation → GPU Shader (🔴 Critical — ~25,000 matrix ops/frame)

**Files:** `FogManager.ts`, `BoardBuilder.ts`

**Current problem**: `updateAnimation()` iterates 100 fog cells × 250 voxels = **25,000** `Object3D` matrix recompositions every frame on the CPU. Also allocates `new THREE.Object3D()` inside the loop body each frame. Each fog InstancedMesh then uploads its instance matrix to the GPU (100 uploads/frame).

- [ ] **Move fog bobbing/rotation to a custom vertex shader**: Pass `time` as a uniform; compute per-instance displacement in the vertex shader using instance ID + seeded noise. Remove `updateAnimation()` entirely.
- [ ] **Alternative (simpler)**: Use `setAttribute` with a custom `aPhase`/`aSpeed` buffer attribute instead of storing `voxelData` in `userData`. Vertex shader reads those attributes for per-voxel animation.
- [ ] **Fallback (minimal change)**: Reuse the `dummy` object across frames (move to class field), throttle fog updates to every 3rd frame, skip fog cells not in camera frustum.

| Tradeoff | Detail |
|---|---|
| ✅ Gain | ~25k CPU operations/frame eliminated; 100 GPU buffer uploads eliminated |
| ⚠️ Cost | Shader approach requires rewriting `BoardBuilder` fog creation to encode animation data into vertex attributes |
| ⚠️ Visual | Frustum-culling fallback may cause visible "pop-in" of fog animation at screen edges |

---

### P.2.2 — Particle System → InstancedMesh Pool (🔴 Critical — draw call explosion)

**Files:** `ParticleSystem.ts`

**Current problem**: Every particle (smoke, fire, explosion, splash, voxel debris) is an individual `THREE.Mesh`. During combat, 50–100+ live particles = 50–100+ draw calls. Each smoke particle also clones its material (`mat.clone()` on line 153).

- [ ] **Replace per-particle meshes with a fixed-size InstancedMesh pool** per particle type (e.g., max 200 smoke, 100 fire, 50 explosion). Update matrices and colors via `setMatrixAt` / `setColorAt`.
- [ ] **Eliminate material cloning**: Use `setColorAt` on the InstancedMesh instead of cloning `MeshStandardMaterial` for each smoke particle.
- [ ] **Opacity fade via custom attribute**: Add a per-instance `aOpacity` attribute driven from the vertex shader, replacing individual `material.opacity` tweaks.

| Tradeoff | Detail |
|---|---|
| ✅ Gain | Draw calls from particles collapse from O(n) to O(1) per type (~4 total). Material GC pressure eliminated. |
| ⚠️ Cost | Major rewrite of `ParticleSystem.ts`. Pool management adds complexity (ring-buffer index, lifecycle tracking). |
| ⚠️ Visual | Fixed pool size means capping max simultaneous particles — could clip during multi-ship sinking. Tune pool sizes carefully. |

---

### P.2.3 — Shadow Configuration (🟡 Medium — easy win)

**Files:** `Engine3D.ts`, `Config.ts`

**Current problem**: Using `PCFSoftShadowMap` (2-tap PCF, most expensive built-in shadow type) with a 1024×1024 shadow map and a large shadow camera frustum (50×50 units). DirectionalLight shadow renders a full shadow pass each frame.

- [ ] **Switch to `PCFShadowMap`** (single-tap, ~30% cheaper).
- [ ] **Reduce shadow map to 512×512** (quarter the fill for shadows).
- [ ] **Add `Config.visual.shadowsEnabled` toggle** — allow disabling shadows entirely for low-end devices.
- [ ] **Tighten shadow camera frustum** to actual board bounds (~12×12 instead of 50×50).

| Tradeoff | Detail |
|---|---|
| ✅ Gain | ~20–40% reduction in shadow pass cost. Toggle gives users control. |
| ⚠️ Visual | `PCFShadowMap` produces slightly harder shadow edges. 512px may show aliasing on close-up views. |

---

### P.2.4 — Renderer & Canvas Settings (🟡 Medium — trivial changes)

**Files:** `Engine3D.ts`, `Config.ts`

- [ ] **Make `antialias` configurable** via `Config.visual.antialias`. Default `true` on desktop, `false` on mobile/low-end. Disabling AA typically doubles fill-rate throughput.
- [ ] **Cap `pixelRatio` to 1.5** instead of 2 — retina screens render 4× pixels at ratio 2. Visually nearly indistinguishable at 1.5 but ~44% fewer pixels.
- [ ] **Remove `FogExp2`** — the scene is small and fog adds minimal visual value versus its per-fragment cost. The board already has its own voxel-based fog.

| Tradeoff | Detail |
|---|---|
| ✅ Gain | Up to 2× fillrate improvement on retina. Fog removal saves per-fragment math. |
| ⚠️ Visual | Jagged edges without AA (mitigated by FXAA post-pass if desired). Slightly sharper distant geometry without scene fog. |

---

### P.2.5 — Raycasting Throttle (🟢 Low — easy)

**Files:** `InteractionManager.ts`

**Current problem**: `raycaster.intersectObjects()` runs **every frame** against 100 grid tiles, even during ENEMY_TURN, GAME_OVER, or while animations play (the result is just discarded).

- [ ] **Skip raycasting entirely** when `InteractivityGuard.isBlocked()` or during `ENEMY_TURN` / `GAME_OVER`.
- [ ] **Throttle to every 2nd frame** during active interaction phases — mouse hover doesn't need 60Hz precision.

| Tradeoff | Detail |
|---|---|
| ✅ Gain | Eliminates ~50% of raycast computation. |
| ⚠️ Visual | 30Hz hover update may feel slightly less responsive on high-refresh displays. |

---

### P.2.6 — `isBusy()` Caching (🟢 Low — easy)

**Files:** `EntityManager.ts`

**Current problem**: `isBusy()` iterates all children of both board groups every frame to check `userData.isSinking`. `hasActiveParticles()` does `.some()` over all particles.

- [ ] **Track sinking ship count via a counter** — increment on sink start, decrement when `position.y <= sinkFloor`. Avoid full traversal.
- [ ] **Track non-smoke/fire particle count** — increment on spawn, decrement on removal. `hasActiveParticles()` becomes `this.activeExplosionCount > 0`.

| Tradeoff | Detail |
|---|---|
| ✅ Gain | Eliminates O(n) child traversal each frame. |
| ⚠️ Risk | Counter bugs (missed decrement) could cause phantom "busy" state. Add assertions in dev mode. |

---

### Summary — Expected Impact

| Tier | Optimization | Est. FPS Gain | Effort |
|---|---|---|---|
| 🔴 | P.2.1 Fog → Shader | **+30–60%** | High |
| 🔴 | P.2.2 Particle pooling | **+15–30%** (in combat) | High |
| 🟡 | P.2.3 Shadow tuning | **+10–20%** | Low |
| 🟡 | P.2.4 Renderer settings | **+10–40%** (retina) | Trivial |
| 🟢 | P.2.5 Raycast throttle | **+3–5%** | Trivial |
| 🟢 | P.2.6 isBusy() caching | **+1–2%** | Trivial |
