---
inclusion: always
---

# Product: 3D Voxel Battleships

Browser-based Battleships game with a Minecraft-style 3D voxel aesthetic, built with Three.js and TypeScript.

## Game Modes
- Classic: American rules (standard fleet, standard placement)
- Russian: Russian rules (1×4-deck, 2×3-deck, etc., strict non-touching adjacency)
- Rogue: Placeholder for future rogue-like mode (movable ships, weapon variety)

## Core Gameplay
- Single-player vs AI (Easy / Normal / Hard difficulty)
- Turn-based: place ships → take turns firing → destroy all enemy ships to win
- 3 save/load slots via localStorage
- Day/night theme toggle

## Key Visual Features
- Voxel water with animated shaders (sine wave / noise)
- Ship destruction with particle explosions and smoke effects
- Raycasting-based grid interaction with hover highlights
- Camera transitions between player/enemy boards per turn phase

## Design Priorities
- Lightweight and fast-loading
- Extensible architecture for future Rogue mode (movable ships, AoE weapons)
- Domain logic fully decoupled from rendering
