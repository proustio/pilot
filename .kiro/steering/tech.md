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
- Use `requestAnimationFrame` for rendering; decouple heavy simulation (e.g., Hard AI Monte Carlo) from the render loop
- `InteractivityGuard` (static class) blocks all user input during camera transitions, turn animations, and menu overlays

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
