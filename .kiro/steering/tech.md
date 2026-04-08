---
inclusion: always
---

# Tech Stack & Code Conventions

## Language & Runtime
- TypeScript strict mode, ES2020 target, ES Modules (`"type": "module"`)
- `tsc` for type checking only (noEmit) — Vite handles transpilation

## Build & Dev
- Vite 7.x — dev server, bundler, HMR
- Commands: `npm run dev` (dev server), `npm run build` (tsc + Vite bundle), `npm run preview` (production preview)

## Key Dependencies
- three.js 0.183.x — 3D rendering, shaders, instanced meshes, raycasting
- Tailwind CSS 3.4.x — utility-first styling
- Web Audio API — procedural sound synthesis via `AudioEngine` (no audio file assets)

## Code Style Rules
- One class per file; filename matches the primary export
- Prefer `const` and immutable patterns; avoid `any` — use explicit types or generics
- No direct `document.dispatchEvent` — use `GameEventBus` for all cross-layer communication
- No hardcoded colors in meshes or shaders — query `ThemeManager.ts` and react to `THEME_CHANGED` events
- No direct DOM manipulation outside `presentation/` layer

## CSS Strategy
Tailwind-first, in this priority order:
1. Built-in Tailwind utility classes
2. Custom Tailwind classes (via `tailwind.config.js` or `@layer`)
3. Custom CSS only as a last resort

Style modules (`theme.css`, `components.css`, `hud.css`, etc.) are bundled via `@import` in `src/style.css`.

## UI Pattern
- All UI components extend `BaseUIComponent` (abstract class with `mount`/`unmount`/`show`/`hide` lifecycle)
- UI renders into the `#ui-layer` div overlay above the Three.js canvas
- HTML templates live in `presentation/ui/templates/` and load via `TemplateEngine.ts`
- CSS custom properties are hydrated by `ThemeManager` for real-time theme switching

## Performance Constraints
- Keep draw calls < 100 — use `InstancedMesh` for repeated voxel geometry (ships, water, particles)
- Use `requestAnimationFrame` for rendering; decouple heavy simulation from the render loop
- Multi-speed engine supports toggles from **0.25x (slo-mo)** to **32x (ludicrous)**
- `InteractivityGuard` (static class) blocks all user input during camera transitions, turn animations, and menu overlays

## Performance Architecture

Four architectural optimizations are implemented to eliminate CPU bottlenecks and target high FPS:

### 1. O(1) Fog Visibility Cache (`FogVisibility.ts`)
- `FogVisibility` maintains a flat `Uint8Array` visibility cache (one byte per cell)
- `isCellRevealed(x, z)` is a direct array index — `O(1)` in the hot path
- Cache is rebuilt via `rebuildCache()` **only on game state changes** (ship move, ship destroyed, sonar dropped) — never per-frame
- Permanent reveals (`Set<number>`) and temporary reveals (`Map<number, duration>`) are overlaid on top

### 2. Web Worker for Hard AI (`ai.worker.ts`)
- The Hard AI Monte Carlo heatmap simulation runs inside a dedicated **Web Worker** (`src/application/ai/ai.worker.ts`)
- The main thread serializes the board's `Uint8Array` grid state and ship manifest, posts to the worker, and awaits the result asynchronously — zero frame blocking
- Worker is spawned per-calculation and terminates after posting results back
- Falls back to synchronous execution in environments without `Worker` support (e.g., Node/JSDOM tests)
- Import pattern: `new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })` via Vite

### 3. Data-Oriented Flat Animation Arrays (`EntityManager.ts`)
- `EntityManager` keeps three flat arrays instead of scene-graph traversals during hot paths:
  - `activelySinkingShips: THREE.Object3D[]`
  - `activelyMovingShips: THREE.Object3D[]`
  - `activelyRotatingShips: THREE.Object3D[]`
- Completed animations are removed using **swap-and-pop** (`O(1)` removal)
- `updateTurretTransforms()` iterates only these arrays to sync turret instance matrices — never walks `group.children`
- The scene graph is used only for rendering, not for logic

### 4. Ghost Mesh Pooling (`InputFeedbackHandler.ts`)
- During `SETUP_BOARD`, the ghost ship preview is pre-built **once** via `buildGhostPool()` (5 shared `BoxGeometry` meshes + one material)
- On `MOUSE_CELL_HOVER`, only `ghostGroup.position` and voxel visibility flags are updated — no geometry is created or destroyed
- Invalid placements toggle mesh color/opacity via material properties, not mesh disposal
- Ghost group has `renderOrder = 999` to always render on top

## Testing
- Test files are co-located: `*.test.ts` alongside source, or in `__tests__/` subdirectories
- Domain and application layers are framework-free, enabling headless unit testing without Three.js or DOM mocks

## Storage
- localStorage only — 3 save/load slots via `Storage.ts`

## Platform Distribution
- Single `dist/` output for all targets
- Desktop: Electron shell wrapping `dist/`
- Mobile: Capacitor container for iOS/Android
- Platform-specific CSS hardening (disable scrolling, user-selection, magnifying glass) via media queries
