# Phase 9: Improvements 1 Implementation Tasks

This document contains a step-by-step action plan to implement the improvements described in `improvements-1.md`. This is designed to be followed sequentially or assigned out as needed.

## 1. HUD "Ships Alive" Counter Update & Animation
- [ ] Refactor the HUD update logic so the counters update immediately when a shot resolves (hit/miss/sink), bypassing the existing turn-delay timer.
- [ ] Add a visual CSS or DOM-based particle explosion animation to the counter element when its number decrements.
- [ ] Ensure the animation state cleanly resets if multiple ships are sunk in quick succession (or overlapping turns).

## 2. Advanced Camera Controls
- [ ] Integrate `OrbitControls` (or a custom camera controller logic) for the Three.js main camera.
- [ ] Implement rotate logic: Bind camera orbiting around the board to basic "Click and Drag".
- [ ] Implement pan logic: Bind camera panning (translation along the viewing plane) to mouse dragging explicitly when the `CTRL` or `CMD` (Meta) key is held down.
- [ ] Implement zoom logic: Bind camera zoom (adjusting distance or FOV) to the mouse scroll wheel.
- [ ] Define and apply strict camera constraints (min/max zoom, pan bounds, polar angles) to prevent the user from losing sight of the active game board.

## 3. 2D and 3D View Toggle
- [ ] Add a "View Toggle" (2D/3D) button to the HUD interface or Settings menu.
- [ ] Track the current 3D camera state (position, rotation, zoom) to save it before transitioning to 2D.
- [ ] Implement the 2D Top-Down Camera state (moving the camera directly overhead, looking straight down at the board).
- [ ] Create a smooth transformation loop (lerping) to animate the camera seamlessly between the stored 3D view and the 2D top-down view.
- [ ] Connect the HUD toggle button to trigger this state transition, resetting to the exact previous 3D angle when switching back.

## 4. Overlay Interaction Blocking
- [ ] Implement a central interaction state check or an invisible DOM overlay blocker.
- [ ] When UI overlays (Main Menu, Settings, Game Over) are visible, programmatically disable the Raycaster or ignore all pointer events interacting with the 3D scene.
- [ ] Test interactions to ensure you cannot select ships, place ships, or fire on the grid while the Settings or Menu screen is open over the game.

## 5. Ship Placement Projection
- [ ] During the `SETUP_BOARD` phase, render a placeholder "ghost" mesh or silhouette corresponding to the currently selected ship.
- [ ] Tie the ghost mesh's position to the active grid coordinates being hovered by the Raycaster.
- [ ] Evaluate placement boundary limits and overlap constraints in real-time on hover.
- [ ] Apply a semi-transparent *green* material to the projection if the hovered placement is valid.
- [ ] Apply a semi-transparent *red* material to the projection if the hovered placement is invalid.

## 6. Ship Rotation via 'R' Key
- [ ] Bind a keydown event listener specifically for the `R` key, active only during the `SETUP_BOARD` phase.
- [ ] Toggle the placement `orientation` state (horizontal vs. vertical) of the selected ship when `R` is pressed.
- [ ] Instantly update the visual ghost projection mesh to reflect this new orientation on the grid.
- [ ] Add a small UI hint near the setup area or ship preview stating: "Press 'R' to Rotate".

## 7. Dynamic Water Board
- [ ] Convert the static board plane to utilize the existing voxel water shader (from Phase 8) or upgrade it for interactivity.
- [ ] Ensure the board surface features continuous, smooth wave animations.
- [ ] Plumb event hooks into the shader to update uniforms based on game events (passing coordinates to the shader):
    - [ ] Create a ripple or displacement effect when a ship is dropped/placed during setup.
    - [ ] Create a turbulent splash reaction precisely where shots land (hit or miss).
    - [ ] Create a continuous chaotic water displacement effect around the coordinates of a sinking vessel.
