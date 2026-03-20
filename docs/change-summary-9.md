# Changes Summary — Rogue Mode (9)

This sprint focuses on implementing the **Rogue Mode** for Battleships. This mode introduces a more dynamic and tactical gameplay experience by moving away from the static "two-board" layout of classic battleships.

### Key Conceptual Changes:

1.  **Shared Battlefield**: Unlike Classic mode, Rogue mode takes place on a single 10x10 grid. Both players place their ships on this same board, creating a "cat and mouse" environment where positioning and movement are crucial.
2.  **Dynamic Fog of War**: The fog of war is no longer a static overlay on the enemy board. Instead, it’s a personal "bubble" attached to each ship. As ships move, they reveal the area around them (7-cell radius) and leave a trail of fog behind.
3.  **Ship Lifecycle & Movement**: Ships are no longer static targets. Every ship has a movement allowance (inversely proportional to its size) and can change position once per turn.
4.  **Advanced Arsenal**: While this sprint focus on stubs, the architecture supports a wider range of weapons beyond the standard cannon, including mines, sonar, and air strikes.

### Architectural Impact:

*   **Domain Layer**: `Ship` and `Board` classes are extended to handle movement state and single-board collision logic.
*   **Application Layer**: `GameLoop` is updated to handle the per-ship turn rotation (Smallest -> Largest) and new custom events for movement and advanced weapons.
*   **Presentation Layer**: `FogManager` and `EntityManager` are enhanced to support dynamic opacity updates and smooth 3D translations of ship models.

> [!IMPORTANT]
> This mode represents a significant shift in game mechanics. Ensure that the core `MatchMode` logic is robust enough to toggle between Classic and Rogue without breaking the base game.
