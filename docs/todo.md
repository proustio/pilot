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
`./linetree.sh src 200`
src/ (6468)
├── presentation/ (4549)
│   ├── 3d/ (3299)
│   │   ├── entities/ (2302)
│   │   │   ├── ParticleSystem.ts (653)
│   │   │   ├── EntityManager.ts (444)
│   │   │   ├── FogManager.ts (308)
│   │   │   ├── ShipFactory.ts (238)
│   │   │   ├── BoardMeshFactory.ts (222)
│   │   │   ├── BoardBuilder.ts (221)
│   │   │   └── ProjectileManager.ts (216)
│   │   ├── interaction/ (735)
│   │   │   ├── InteractionManager.ts (298)
│   │   │   ├── InputFeedbackHandler.ts (228)
│   │   │   └── RangeHighlighter.ts (209)
│   │   └── Engine3D.ts (262)
│   └── ui/ (1250)
│       ├── hud/ (841)
│       │   ├── HUDControls.ts (303)
│       │   ├── HUD.ts (280)
│       │   └── UnifiedBoardUI.ts (258)
│       ├── settings/ (203)
│       │   └── Settings.ts (203)
│       └── UIManager.ts (206)
├── application/ (979)
│   ├── game-loop/ (763)
│   │   ├── GameLoop.ts (320)
│   │   ├── TurnExecutor.ts (224)
│   │   └── MatchSetup.ts (219)
│   └── ai/ (216)
│       └── AITargeting.ts (216)
├── styles/ (421)
│   └── hud.css (421)
├── infrastructure/ (241)
│   └── storage/ (241)
│       └── Storage.ts (241)
└── main.ts (278)