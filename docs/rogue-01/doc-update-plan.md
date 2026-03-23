I can see there's a confusion about using just one side of the board in rogue mode.
consider @beautifulMention
document explicitly how the board functions.

in classic and russian modes:

- board is 10x10 cells
- ships are static
- you can only shoot once per turn
- hit/miss/kill markers are permanent
- board has 2 active sides. one side friendly, another side for the enemy. the board flips revealing player board on enemy turns and flips to enemy side covered by fog for the player to shoot
- animations and effects are applied to the currently active side

in contrast, in rogue mode

- board is 20x20 cells
- each ship can either move, attack or skip on each turn
- ships can attack normally or with a special attack
- hit/miss markers are transient, they vanish after the next opponent's turn. kill markers are permanent
- board has 1 active side. both player and the enemy place their ships on the same side, but in opposing 10x10 corners. all of the board is covered by fog of war by default, however each ship(and some weapon systems) reveal a 5-cell radius around them. the board stays static, it does not flip between turns.
- item are placed, animations and effects are applied to the only side this game is played on
