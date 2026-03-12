Please take a look at @game-concepts.md, @tech-breakdown.md and @tasks.md. We want to continue improving our game. We will make both visual, functional and maybe even some structural changes.

1. the board should be close by default with minimal margin between it and the window boundaries.
1. highlight of the mouse pointer is projected too low
1. when in main menu, the setting screen should be displayed to the right of main menu, to be accessible without going into sub-menus
1. add auto-battler and geek-stats options to the hud, next to board flip.
1. loading from a saved game, board orientation is broken. we should make board orientation and all view options(2d vs 3d, rotation, pan and zoom level) part of the save datas


also consider:

Enhanced Save/Load Persistence: Include camera and board orientation in save states.
include all ships(alive and dead), include hit and miss info, include 

Main Menu Layout Redesign: Display Settings directly to the right of the Main Menu.
this was already completed

Raycasting/Projection Fix: Resolve the "projected too low" highlight issue.
highlight should be on the ship-level instead of the pool's bottom.

Board Proximity & Viewport Margin: Adjust camera/controls to minimize margins.
2d view breaks after transitioning to 3d and back. it also breaks when my turn ends. transition should be smooth and always available. also instead of "2d view" and "3d view" use 🗺️ and 🌍 respectively.

HUD Enhancement: Add Auto-Battler and Geek Stats toggles to the main HUD.
completed already - remove

Create the task list with the following items derived from docs/iter-4/summary.md:
add more changes to this list:
1. replace all text with just emoji buttons
2. replace "2d/3d" and "night/day" buttons with togges - 🗺️ and 🌎 for 2d/3d and 🌚 and 🌞 for daytime
3. "speed: 1x" should instead display display "1x ▶️" ,"0.5x  ⏯️", "2x ⏩", "4x ⏫"
4. "pause" button should just show ⏸️