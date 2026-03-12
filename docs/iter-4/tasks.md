# Iteration 4 — Advanced UI & Persistence Improvements

Action items derived from `docs/iter-4/summary.md` and user feedback. Each top-level item is a self-contained, committable unit of work.

---

## 1. Viewport & 2D/3D Transition Fixes
- [ ] Fix bug where 2D view breaks after transitioning to 3D and back.
- [ ] Ensure 2D view is correctly restored or maintained when a turn ends.
- [ ] Implement smooth animated transitions between 🗺️ (2D) and 🌍 (3D) views.
- [ ] Minimize board margin relative to window boundaries by default.

---

## 2. Ship-Level Highlight (Raycasting)
- [ ] Adjust `InteractionManager.ts` to project the mouse highlight onto the ship/grid plane.
- [ ] Fix the "projected too low" issue caused by the increased pool depth.
- [ ] Ensure highlight is visible even when hovering over already placed ships or wreckage.

---

## 3. Emoji-fied HUD Interface
- [ ] Replace all text labels on HUD buttons with pure emoji icons.
- [ ] Use 🗺️ for 2D View and 🌎 for 3D View.
- [ ] Use 🌞 for Day Mode and 🌚 for Night Mode.
- [ ] Replace "Pause" text with ⏸️.
- [ ] Implement stylized Speed button states:
    - 0.5x: `0.5x ⏯️`
    - 1.0x: `1x ▶️`
    - 2.0x: `2x ⏩`
    - 4.0x: `4x ⏫`

---

## 4. Comprehensive Game Persistence
- [ ] Update `Storage.ts` to include all ship instances (alive and dead status).
- [ ] Include detailed hit/miss coordinate history in the save state.
- [ ] Persist `OrbitControls` state (zoom, pan, rotation).
- [ ] Persist board orientation (which side is being viewed).
- [ ] Verify that loading accurately reconstructs the entire battlefield state and view exactly as it was.

---

## 5. Update Default Game Settings
- [ ] Update `Config.ts` to set `gameSpeedMultiplier` to `4.0`.
- [ ] Update `Config.ts` to set `autoBattler` to `true`.
- [ ] Update `AIEngine.ts` to default `difficulty` to `hard`.
- [ ] Verify that a fresh game starts with these high-intensity settings active.
