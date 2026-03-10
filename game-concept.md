# Battleships

We are building JS-based "Battleships" game, that can be ran in-browser.
We want to make it as light weight as possible, to load quickly and play smoothly.

We want to have "Modes" in our game, and initially only support 2 modes:
a. "Classic" mode, or american version of the game as described on wikipedia: https://en.wikipedia.org/wiki/Battleship_(game)#Description
b. "Russian" mode, or the russian version of the game as described (in russian) on another page: https://ru.wikipedia.org/wiki/%D0%9C%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%B9_%D0%B1%D0%BE%D0%B9_(%D0%B8%D0%B3%D1%80%D0%B0)
c. "Rogue" mode, a UI placeholder for the rogue-like mode we may make later.


## Design and Interactivity

We should have the main menu, that allows us to load or start new game - 3 slots max.
Game should be 3D and made of voxels.
We are going for the minecraft feel.
Water should be made of voxels, should be animated and it should react to ships movement and to projectiles (hit or miss).
Ships should be made of voxels. Hits and kills on a ship should be animated. As a ship is getting hit, voxels should fly out with explosion effect to indicate damaged sessions. 
When a player is attaching, one of the vessels should be selected to be animated as firing.
Places where ships were hit, should be indicated by destruction with grey smoke.
Places where ships were sank should be indicated by underwater wreckage and black smoke.
Placing ships, selecting cell to fire and simply hovering over the field should highlight the area that is being hovered over.
We should have a basic "enemy ai". We want to be able to play against this ai and to have multiple levels of challenge - easy, normal and hard.
We should have a settings screen and allow players to toggle hud elements, highlighting, We should have a settings screen and allow players to toggle hud elements, highlighting, We should have a settings screen and allow players to toggle hud elements, highlighting, enemy difficulty setting.

## Gameplay

Standard gameplay for now: place ships, shoot in turns with other player, destroying all enemy ships wins the game.
In the future(rogue mode) we may want to add different gameplay mode and allow ship and weapons variation.
In the future(rogue mode) we may want to make ships moveable.
We will skip those features now, but we will make our game code flexible enough to support these options later.