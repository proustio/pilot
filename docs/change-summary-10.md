# Changes Summary — Multiplayer PvP (10)

This sprint focuses on the **scaffolding of the Multiplayer PvP system**. The objective is to establish the core networking infrastructure and UI without requiring a specialized backend during the initial phase.

### Key Conceptual Changes:

1.  **Network Abstraction**: We're introducing a clear interface for communication (`INetworkAdapter`), allowing us to start with a basic WebSocket implementation while keeping the option open for other protocols (WebRTC, Polling, etc.) in the future.
2.  **Event Synchronization**: The `SyncManager` acts as an event bus bridge. It captures domain events in one browser instance and re-broadcasts them in another, maintaining state consistency.
3.  **Lobby Integration**: A new "Multiplayer" entry in the main menu leads to a dedicated `LobbyMenu`. This UI handles room creation, joining, and player readiness, following the game's retro aesthetic.

### Architectural Impact:

*   **Infrastructure Layer**: Addition of `SyncManager` and `WebSocketAdapter`. These components manage the lifecycle of a network session and handle data serialization.
*   **Presentation Layer**: New `LobbyMenu` component and corresponding styles. This screen manages the transitions into a network-synced game session.
*   **Application Layer**: `GameLoop` is updated to include a `LOBBY` state, allowing for a structured waiting period before a match begins.

> [!TIP]
> Use a simple local WebSocket echo server for testing. This ensures that the message routing and event dispatching work before we introduce a more complex authoritative server.
