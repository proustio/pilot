---
inclusion: always
---

# Product: 3D Voxel Battleships

Browser-based Battleships game with a Minecraft-style 3D voxel aesthetic, built with Three.js and TypeScript. Designed for lightweight performance and a premium, responsive feel.

## Game Modes
- Classic: American rules (standard fleet, standard placement)
- Russian: Russian rules (1×4-deck, 2×3-deck, etc., strict non-touching adjacency)
- Rogue: Rogue-like mode with movable ships and weapon variety (in development)
- PvP: Multiplayer mode (in development)

## Core Gameplay
- Single-player vs AI (Easy / Normal / Hard difficulty)
- Turn-based: place ships → take turns firing → destroy all enemy ships to win
- Storage: 3 save/load slots via localStorage
- Day/night theme toggle

## Board Functionality

### Classic / Russian Modes
- **Grid Size**: 10x10 cells.
- **Ships**: Static placement; fixed position for the duration of the match.
- **Turns**: Single shot per turn.
- **Persistence**: Hit, miss, and kill markers are permanent.
- **Dual Boards**: The game features two active sides (Friendly and Enemy). The board flips to reveal the player's board during enemy turns and flips to the enemy's side (covered by fog) for the player to shoot.
- **Effects**: Animations and visual effects are applied to the currently active side.

### Rogue Mode
- **Grid Size**: 20x20 cells.
- **Dynamic Fleet**: Each ship can move, attack, or skip on each turn. Once destroyed, dead ships remain on the board and permanently block the cells they occupied at the time of death until the end of the game.
- **Attacks**: ships can perform normal attacks or utilize special weapon systems.
- **Persistence**: Hit and miss markers are transient, vanishing after the next opponent's turn. Kill markers remain permanent.
- **Shared Board Architecture**: Unlike the dual-board setup in Classic mode, Rogue mode utilizes a single 20x20 shared coordinate space. Ships start in opposing 10x10 corners, and the viewport/orientation remains static throughout the match. Cells occupied by destroyed ships remain blocked and impassable for the remainder of the game.
- **Fog of War**: The entire board is obscured by fog by default. Individual ships (and some weapon systems) reveal a 5-cell radius around them.
- **Static Orientation**: The board does not flip between turns; it remains static.
- **Unified Environment**: Items are placed, and all animations/effects are applied to the single shared game board.

## Key Visual Features
- Voxel water with animated shaders (sine wave / noise)
- Fog of War: Volumetric voxel-based clouds that sit at water level and obscure enemy fleet.
- Ship destruction: Voxel particles, persistent hit flames, and authentic multi-layered explosion audio.
- Sunken ships: Underwater wreckage and lingering black smoke markers.
- Attacker Selection: A random player vessel is selected to animate as "firing" when an attack is initiated.
- Interaction: Raycasting-based grid selection with glowing, translucent 3D hover highlights.
- Camera transitions between player/enemy boards per turn phase
## Design Priorities
- **Maintainability through Modularity**: Prevent codebase rot by proactively decomposing large classes and monolithic CSS files into smaller, responsibility-focused modules.
- **Lightweight Performance**: Maintain fast-loading voxel assets and efficient instanced rendering.
- **Architectural Extensibility**: Ensure the engine can easily accommodate new game modes (like the upcoming Rogue mode) by keeping core domain logic decoupled from presentation.
