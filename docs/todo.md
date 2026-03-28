# TODOs

We are working on our Battleships game, as documented in

steering

Here is some stuff we need to do around our codebase in no particular order or preference:

1. translate most of the CSS into tailwind
1. hovering over minimap should highlight respective cells on the main battle field as if those are being hovered over.
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
1. change mouse hover highlight from a cross to a tornado swirlmma
1. classic and russian modes default speed should be what is 4x now. all other speeds should be adjusted accordingly.
1. firing range should be highlighted on the battle field
1. ships should be able to fire at the distance of 10 squares around them
1. support ship-specific weapons, per ship type. we should show which weapon systems are available and hide those that aren't
1. improve ship models: add huge guns to all combat vessels, add flightdeck to aircraft carrier, make submarine go under water (move special to the ship type) etc.
1. ships should produce visible ripples as they move
