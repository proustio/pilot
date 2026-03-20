Please take a look at these documents that briefly describe different aspects of our implementation:
.kiro/steering/product.md
.kiro/steering/structure.md
.kiro/steering/tech.md
We want to continue improving our game. 
We will make both visual, functional and maybe even some structural changes.

1. Visual adjustments:
    * fog should be much thicker
    * fog should sit a tiny bit lower
    * hit ship segments should be burning with a tiny flame even when hidden behind the fog of war
    * burning should become more intense as more segments are hit
    * ship killed sound is bad, generate a more authentic explosion sound

2. implement rogue mode
    * support single-side game where both players place their ships on the same side
    * add alternative usage for fog of war - it should now wrap every ship at a distance of 7 cells and disappear and reappear as ships move.
    * add ability for the ships to move (5-ship.length) cells per turn
    * add alternative attacks: laying mines, sonar pings, dispatching warplanes, just ramming other vessels, etc.
    * allow each ship to either: attack, move or turn once per turn.
    * rotate currently active ship so that each player turn he plays another ship. starting from the smaller vessels to the larger.

3. add multiplayer pvp
    * networking
    * sync mechanism
    * UI for lobby, invites, etc.

