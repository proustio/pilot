---
inclusion: always
---

# Product: 3D Voxel Battleships

Browser-based Battleships game with a Minecraft-style 3D voxel aesthetic. Single-player vs AI, turn-based ship combat.

## Game Modes

| Mode    | Grid  | Key Mechanics                               | Status         |
| ------- | ----- | ------------------------------------------- | -------------- |
| Classic | 10x10 | American rules, dual boards, static ships   | Stable         |
| Russian | 10x10 | Strict non-touching adjacency, static ships | Stable         |
| Rogue   | 20x20 | Movable ships, special weapons, fog of war  | In development |

## Core Loop

Place ships → take turns firing → destroy all enemy ships to win.

- AI difficulties: Easy (random), Normal (hunt/target), Hard (Monte Carlo heatmap)
- 3 save/load slots via localStorage
- Day/night theme toggle with custom Tactical Color Schemes

## Mode-Specific Rules

### Classic / Russian

- Static ship placement for the entire match
- Single shot per turn
- All markers (hit, miss, kill) are permanent
- Dual-board layout: camera transitions between friendly and enemy boards per turn phase
- Effects and animations apply to the currently active board side only

### Rogue

- Single shared 20x20 board; ships start in opposing 10x10 corners
- Each ship can move, attack, or skip per turn.
- Board orientation is static (never flips)
- Fog of war: 5-cell visibility radius around each living ship
- Destroyed ships remain on board permanently, blocking their occupied cells
- Marker persistence: miss markers are transient (vanish after opponent's next turn); hit and kill markers are permanent
- Weapon profiles: default 1x1 attack plus AoE and special weapons via `weaponType`
- **Ramming**: Ships can ram others to inflict mutual damage. Rammer turns 90° and stops adjacent to the victim.
- **Dynamic Ammo**: Ships can fire as many times as they have active (non-hit) sections in a single turn.

## AI Behavior (Difficulty Tiers)

- **Easy**: "Search & Destroy" — travels until an opponent is found, then moves all ships to kill it. Defaults to random fire.
- **Normal**: "Self-Preservation" — remembers enemy locations for two turns and actively retreats while firing from safety.
- **Hard**: "Tactical Heatmap" — uses Monte Carlo simulations to predict ship locations and patterns.

## Visual Identity

- Voxel water with animated sine-wave + noise shaders and ripple effects during ship movement.
- Volumetric voxel fog clouds at water level for fog of war
- Ship destruction: voxel particle breakup, persistent hit flames, multi-layered explosion audio
- Sunken ships: underwater wreckage with lingering black smoke and lingering visual debris.
- Attacker selection: random player vessel animates as the firing ship
- Interaction feedback: raycasting-based grid selection with glowing translucent 3D hover highlights
- **Range Visualization**: Firing range (beyond sight) highlights in a subtle orange glow.

## Game Speed & Pacing

- Classic and Russian modes default to **4x** speed.
- Rogue mode defaults to **2x** speed.
- Available speed toggles: 0.25x, 1x, 2x, 4x, 8x, 16x, 32x.

## Distribution

Single `dist/` output deployed to all platforms. Core game logic and rendering stay decoupled from wrapper code.

| Platform  | Wrapper   | Notes                                |
| --------- | --------- | ------------------------------------ |
| Web (PWA) | None      | Offline-capable via Service Workers  |
| Desktop   | Electron  | Steam/Itch.io distribution           |
| Mobile    | Capacitor | iOS/Android with native UI hardening |

## Design Priorities

1. Modularity: decompose classes exceeding ~300-400 lines; prefer delegation over monoliths
2. Performance: draw calls < 100 via `InstancedMesh`; decouple heavy simulation from render loop
3. Extensibility: domain logic decoupled from presentation to support new game modes
4. Platform independence: single build artifact; platform-specific code lives only in wrapper shells
