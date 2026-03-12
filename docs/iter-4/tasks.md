# Iteration 4 — Task List

Derived from [summary.md](file:///Users/alx/code/repos/praust/2-battlehsips/docs/iter-4/summary.md).
Each item is an independent, committable change.

---

## 1. Board Proximity & Default Zoom ✅
Adjust camera defaults so the board fills the viewport with minimal margin to window edges.
- [x] Default 3D camera position: `(0,15,15)` → `(0,12,12)`, FOV: 60° → 50°
- [x] 2D top-down height: 30 → 16
- [x] Orbit maxDistance: 50 → 30

## 2. Raycasting Highlight Fix ✅
Mouse highlight is projected too low — it lands on the pool bottom instead of the ship/water surface.
- [x] Both hover cursor and ghost placement preview now use `getWorldPosition()` instead of copying local tile position, so they sit at the water/ship surface level.

## 3. Smooth & Stable 2D ↔ 3D View Transitions ✅
Removed 2D mode entirely instead of fixing its broken state.
- [x] Removed `is2DMode`, `saved3D*`, `toggle2D3DView`, `TOGGLE_CAMERA_VIEW` listener from `Engine3D.ts`
- [x] Simplified `render()` to always use orbit controls (no 2D branch)
- [x] Removed 2D/3D toggle button and event listener from `HUD.ts`

## 4. Enhanced Save/Load Persistence
Include all view-state in save data so loading a game restores the exact visual context.
- Add to `SaveData`: camera position/rotation, zoom level, pan offset, board orientation, day/night mode.
- Serialise & restore these fields in `Storage.ts`.
- On load, apply restored view-state in `Engine3D.ts` and HUD.

## 5. HUD — Replace Text Labels with Emoji Buttons
All HUD control buttons should use only emoji, no text labels.

| Current label            | New label        |
|--------------------------|------------------|
| `3D View` / `2D View`   | 🗺️ / 🌍        |
| `☀️` / `🌙`             | 🌞 / 🌚         |
| `Speed: 1x`             | `1x ▶️`          |
| *(after cycle)*          | `0.5x ⏯️` · `2x ⏩` · `4x ⏫` |
| `Pause`                  | ⏸️               |

- Update button rendering and the speed-cycle logic in `HUD.ts`.

## 6. Remove Completed Items from HUD
- Remove "Auto-Battler" and "Geek Stats" toggle entry-points from the bottom HUD bar (they were already added in a previous iteration — marked as completed in summary).
- Verify they remain accessible through the Settings / Pause menu only.

---

### Commit order recommendation
Items are mostly independent — commit each separately. Suggested order:
`2 → 1 → 3 → 5 → 4 → 6`
(fix the raycast bug first, then visual/UX changes, save-state last because it touches multiple files).
