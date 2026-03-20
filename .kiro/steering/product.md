---
inclusion: always
---

# Product: 3D Voxel Battleships

Browser-based Battleships game with a Minecraft-style 3D voxel aesthetic, built with Three.js and TypeScript. Designed for lightweight performance and a premium, responsive feel.

## Game Modes
- Classic: American rules (standard fleet, standard placement)
- Russian: Russian rules (1×4-deck, 2×3-deck, etc., strict non-touching adjacency)
- Rogue (Active): Rogue-like mode with movable ships and weapon variety (in development)
- PvP (Active): Multiplayer mode (in development)

## Core Gameplay
- Single-player vs AI (Easy / Normal / Hard difficulty)
- Turn-based: place ships → take turns firing → destroy all enemy ships to win
- Storage: 3 save/load slots via localStorage
- Day/night theme toggle

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
