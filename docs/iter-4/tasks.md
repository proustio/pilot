# Iteration 4 — Task List

Derived from [summary.md](file:///Users/alx/code/repos/praust/2-battlehsips/docs/iter-4/summary.md).
Each item is an independent, committable change.

---

## 1. Board Proximity & Default Zoom
Adjust camera defaults so the board fills the viewport with minimal margin to window edges.
- Update default camera distance / FOV in `Engine3D.ts` or `Config.ts`.
- Ensure both 2D and 3D views respect the tighter framing.

## 2. Raycasting Highlight Fix
Mouse highlight is projected too low — it lands on the pool bottom instead of the ship/water surface.
- Fix the raycast plane height in `InteractionManager.ts` so the highlight sits at ship-level.

## 3. Smooth & Stable 2D ↔ 3D View Transitions
2D view breaks after switching to 3D and back, and also resets when a turn ends.
- Ensure the 2D view state persists across turn changes.
- Make transitions between 2D and 3D smooth and always available (no broken state).

## 4. Enhanced Save/Load Persistence
Include all view-state in save data so loading a game restores the exact visual context.
- Add to `SaveData`: camera position/rotation, 2D vs 3D mode, zoom level, pan offset, board orientation, day/night mode.
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
