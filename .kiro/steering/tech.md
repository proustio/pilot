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

## TypeScript Config Highlights
- `strict: true`, `noUnusedLocals`, `noUnusedParameters`
- `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`
- No test framework currently configured
