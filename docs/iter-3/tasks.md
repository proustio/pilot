# Iteration 3 — Improvement Tasks

Action items derived from `improvements-3.md`. Each top-level item is a self-contained, committable unit of work.

---

## 1. Geek Stats HUD (FPS counter rework)
- [x] Move the existing FPS counter to the **bottom-left** corner.
- [x] Restyle it as a "Geek Stats" panel (monospace font, semi-transparent dark background, compact layout).
- [x] Add the following readouts alongside FPS:
  - [x] RAM / CPU consumption (via `performance.memory` / frame-time heuristics).
  - [x] Server connection status indicator (placeholder — always "offline / local").
  - [x] Game time (elapsed time since match start).
- [x] Add a **"Geek Stats"** toggle in the Pause → Settings menu.
- [x] Respect the toggle — hide/show the panel accordingly.

---

## 2. Save & Load System (3 Slots)
- [x] Implement game-state serialisation (board state, fleet, turn, settings, elapsed time).
- [x] Implement game-state deserialisation and full state restoration.
- [x] Create a **Save/Load** UI dialog with 3 named slots showing metadata (mode, date, turn count).
- [x] Wire **Save** and **Load** buttons into the **Pause Menu**.
- [x] Wire **Save** and **Load** (or just Load for new sessions) into the **Main Menu**.
- [x] Handle edge cases: empty slots, overwrite confirmation, corrupted data.

---

## 3. Deeper Battlefield Pool
- [x] Increase the pool/water depth to **4×** the current value.
- [x] Add a **sand-coloured bottom** plane that visually separates the two sides of the battlefield.
- [x] Adjust camera, lighting, and water shader so the deeper pool looks correct from all angles.

---

## 4. Fix Sunk-Ship Depth on Opposite Side
- [ ] Audit the current sinking animation / final resting depth for destroyed ships.
- [ ] Adjust the sink depth to a value proportional to the new (deeper) pool dimensions.
- [ ] Ensure sunk ships sit convincingly on or near the sand bottom rather than floating on the surface.

---

## 5. Pause Menu Options Rework
- [ ] Update the Pause Menu to contain exactly these options:
  1. Resume
  2. Save
  3. Load
  4. Settings
  5. Exit to Main Menu
- [ ] Remove any options that are not in the list above.
- [ ] Ensure each button triggers the correct action (Resume closes overlay, Save/Load opens dialog, Settings opens settings panel, Exit returns to main menu with confirmation).

---

## 6. "Peek at Other Side" Board Toggle
- [ ] Add a **HUD toggle button** (eye icon or similar) that lets the player peek at the opposite side of the board without committing a turn.
- [ ] Implement the peek — rotate/flip the board temporarily, disable interaction while peeking.
- [ ] Add matching toggle entry in Settings to enable/disable this feature.

---

## 7. Improved Ship Models
- [ ] Redesign ship voxel models with **colour variation** (hull, deck, accents).
- [ ] Make silhouettes more aggressive / military (angled bows, sharper profiles).
- [ ] Add **cannon turrets** (small voxel barrel groups) to each ship, scaled to ship size.
- [ ] Ensure the new models still work correctly with hit detection, destruction particles, and sinking animations.
