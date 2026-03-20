---
inclusion: always
---

# Tech Stack

## Language & Runtime
- TypeScript (strict mode, ES2020 target)
- ES Modules (`"type": "module"` in package.json)

## Build System
- Vite 7.x (dev server, bundler, HMR)
- `tsc` for type checking (noEmit — Vite handles transpilation)

## Dependencies
- three.js 0.183.x — 3D rendering, shaders, instanced meshes, raycasting
- @types/three — type definitions

## UI
- Vanilla HTML/CSS/TypeScript — no UI framework
- CSS custom properties for day/night theming
- All UI components extend `BaseUIComponent` abstract class
- UI is injected into `#ui-layer` div overlay above the Three.js canvas

## Storage
- localStorage for save/load (3 slots)

## Common Commands
```bash
npm run dev      # Start Vite dev server
npm run build    # Type-check with tsc, then bundle with Vite
npm run preview  # Preview production build locally
```

## Code Organization
- **Modular Decomposition**: Large, complex classes (e.g., `GameLoop`, `EntityManager`, `HUD`) are intentionally decomposed once they exceed ~300-400 lines or handle multiple distinct responsibilities.
- **Delegation Pattern**: Primary classes (like `GameLoop`) act as thin coordinators/orchestrators, delegating specific logic to specialized helper classes (e.g., `MatchSetup`, `TurnExecutor`).
- **Shared State**: Communication between coordinators and helpers is managed via explicit state interfaces or minimal public APIs rather than direct field access.
- **Static Builders**: Heavy procedural generation (e.g., 3D board construction) is extracted into static `build()` methods in dedicated classes like `BoardBuilder`.
