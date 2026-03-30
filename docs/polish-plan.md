### **UI, UX & Tech Debt**

- [x] **Settings Screen:** Rework the settings screen to reflect that retro feeling as well.
- [x] **HUD & Feedback:** Highlight vision and attack ranges relative to friendly ships.
- [x] **Enemy Turn UI:** Display weapon and movement systems and highlight the active ship continuously as enemies move or attack.

### **Game Mechanics: Movement & Collision**

- **Distance:** Ships should move twice the distance they currently do.
- **Pathing Checks:** For each cell a ship traverses, the game needs to evaluate state changes: check if any map sections should be revealed/hidden, whether the vessel hit a mine, etc.
- **Impassable Entities:** Ships should NOT be able to move through other ships (dead or alive). Dead ships, mines, sonars, etc., cannot move at all.
- **Ramming Mechanics:** \* Ships can ram other ships to inflict damage on both their own and the enemy's sections.
  - Ramming can happen accidentally to both friendly and enemy ships.
  - The ramming ship should turn 90 degrees and stop adjacent to the victim ship.

### **Game Mechanics: Combat & Stats**

- **Dynamic Ammo:** Ships should be able to fire as many times as they have active sections (firing capacity adjusts down as the ship takes damage).
- [x] **Firing Range:** The firing range is a 2x multiplier of the ship's vision range.
- **Weapon & Movement Systems:** Broadly support all available weapon and movement systems natively across all valid units.

### **Entities, Environment & AI**

- **Enemy AI Balancing:** The enemy ship count should match the player's.
- **Enemy AI Behavior (Difficulty Tiers):**
  - **Easy:** "Search and destroy" protocol. AI will travel until it encounters an opponent, then move all ships to kill it ASAP. Afterwards, it defaults to random cruising or occasional blind fire.
  - **Normal:** Adds a sense of self-preservation. Once it notices the enemy, it remembers the location for the current and next turn. It will actively try to retreat and fire from safety.
- **Static Entities (Mines & Sonars):**
  - **Bug Fix:** Fix deployment and visibility (currently they are either invisible or fail to deploy).
  - Mines are static, visible only to submarines, carriers, and sonars. They explode when an opponent vessel comes within a 1-cell distance.
  - Sonars are static and visible to anyone within a 7-cell distance.

### **Visuals, Animations & Audio**

- **Grid & Environment Visuals:** \* Base water color should be grey.
  - Ship sight range should color the water blue and make it visually radiate.
  - Firing range (beyond sight) should have a subtle orange glow on the board cells that can be fired upon (fitting an orange-green theme).
- **Ship Models:** Improve 3D models/sprites: make the front and back easily distinguishable, add huge guns to combat vessels, flight decks to aircraft carriers, and a special diving animation for submarines.
- **Movement Polish:** \* Add visible water ripples as ships move.
  - Smooth out the movement animation—no teleporting when turning.
  - Normalize animation times: Every "move" takes the exact same amount of time, whether it's 1 cell or 4 cells. The turning animation should also take this exact same amount of time.
- **Ramming Polish:** Add a special animation for ship-to-ship ramming.
- **Audio:** Friendly fire should play the famous "Wilhelm scream" sound effect.

### **Game Modes & Pacing**

- **Game Speed Defaults:** Classic and Russian modes default to "4x" speed. Rogue mode defaults to "2x" speed.
- **Speed Options:** Expand the speed toggles to include: 0.25x, 2x, 4x, 8x, 16x, and 32x.
