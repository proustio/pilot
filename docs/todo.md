# TODOs

We are working on our Battleships game, as documented in

steering

Here is some stuff we need to do around our codebase in no particular order or preference:

1. ships should shoot twice as far as they can see
1. ships should be moving twice the distance they move now
1. ships should NOT be able to move through other ships - dead or alive
1. ships should be able to ram other ships to inflict damage on own and enemy sections. this should have special animation. ramming ship should turn 90 degrees and stop adjacent to the victim ship.
1. ships can accidentaly ram friendly and enemy ships.
1. friendly fire should play the famous "wilhelm scream" sound effect
1. ships should be able to fire as many times as they have active sections - adjust as ship takes damage
1. mines and sonars should be static. mine should just be there, visible only to submarines, carriers and sonars and explode when opponent vessel comes within 1 cell distance. sonar should be visible to anyone withing 7 cells distance.
1. dead ships, mines, sonar, etc should not be able to move
1. enemy ship count should match players
1. enemy behaviour should be adjusted to move until find and then attack, they don't attack enough
1. ship movement animation should be slower and it should produce ripples
1. for each cell a ship is traversing we need to check if any section should be revealed or hidden, check whether vessel hit a mine, etc.
1. ~~change mouse hover highlight from a cross to a tornado swirl~~
1. ~~classic and russian modes default speed should be what is 4x now. all other speeds should be adjusted accordingly.~~
1. ~~firing range should be highlighted on the battle field~~
1. ~~ships should be able to fire at the distance of 10 squares around them~~
1. support ship-specific weapons, per ship type. we should show which weapon systems are available and hide those that aren't
1. improve ship models: add huge guns to all combat vessels, add flightdeck to aircraft carrier, make submarine go under water (move special to the ship type) etc.
1. ships should produce visible ripples as they move
1. ~~settings screen should be reworked to reflect that retro feeling as well~~
1. ~~highlight vision and attack ranges relative to friendly ships~~
1. ~~see weapon and movement systems and active ship displayed as enemies move or attack~~
1. fix sonar and mines deployment and visibility (currently invisible or don't deploy)
1. broadly support all available weapon and movement systems across entities




Consider large files for decomposition:

src/
├── main.ts (278 lines)
├── styles/
│   └── hud.css (296 lines)
├── infrastructure/
│   ├── storage/
│   │   └── Storage.ts (238 lines)
├── domain/
│   ├── board/
│   │   └── Board.ts (305 lines)
├── application/
│   ├── game-loop/
│   │   ├── GameLoop.ts (320 lines)
│   │   └── TurnExecutor.ts (416 lines)
│   ├── ai/
│   │   └── AIEngine.ts (363 lines)
├── presentation/
│   ├── ui/
│   │   ├── hud/
│   │   │   └── UnifiedBoardUI.ts (258 lines)
│   ├── 3d/
│   │   ├── Engine3D.ts (262 lines)
│   │   ├── interaction/
│   │   │   ├── InputFeedbackHandler.ts (335 lines)
│   │   │   └── InteractionManager.ts (397 lines)
│   │   ├── entities/
│   │   │   ├── ProjectileManager.ts (327 lines)
│   │   │   ├── ImpactEffects.ts (328 lines)
│   │   │   ├── ParticleSystem.ts (348 lines)
│   │   │   ├── ShipFactory.ts (349 lines)
│   │   │   ├── FogManager.ts (423 lines)
│   │   │   ├── BoardBuilder.ts (429 lines)
│   │   │   └── EntityManager.ts (470 lines)