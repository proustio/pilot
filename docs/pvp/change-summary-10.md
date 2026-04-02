# Changes Summary — Multiplayer PvP (10)

This sprint focuses on the **scaffolding of the Multiplayer PvP system**. The objective is to establish the core networking infrastructure and UI without requiring a dedicated backend server.

### Key Architectural Decision: Serverless WebRTC

> [!IMPORTANT]
> **No dedicated game server.** PvP uses **WebRTC DataChannels** for direct peer-to-peer communication. Game data flows between browsers without touching a server. A signaling mechanism is only needed for the initial connection handshake.

### Signaling Options (no backend required)

| Approach | How it works | UX |
|---|---|---|
| **QR Code** | Player A encodes SDP offer as QR → Player B scans, generates answer QR → handshake done | Feels like Bluetooth pairing, very private |
| **Room Code + PeerJS** | PeerJS free cloud relay handles signaling via short room codes | One code exchange, smoothest UX |
| **Room Code + Firebase** | Firebase Realtime DB free tier as signaling relay | One code exchange, self-hostable |

### Infrastructure Already Built

The following networking infra is in place and ready for PvP integration:

- **`INetworkAdapter`** — Transport-agnostic interface (`connect`, `send`, `onMessage`, `disconnect`, `getState`)
- **`WebSocketAdapter`** — Reference implementation with auto-reconnect and heartbeat (can be swapped for a `WebRTCAdapter`)
- **`NetworkManager`** — Singleton coordinator that bridges connection state to `GameEventBus`
- **`CONNECTION_STATUS_CHANGED`** event — 3 states: `CONNECTED`, `CONNECTING`, `DISCONNECTED`
- **Geek Stats indicator** — Shows `LOCAL` in PVE, ready to show live connection state in PvP
- **PWA / Service Worker** — Game is fully playable offline after first load

### Remaining Work

1. **`WebRTCAdapter`** — Implements `INetworkAdapter` using `RTCPeerConnection` + `RTCDataChannel`
2. **Signaling UI** — QR code or room code exchange for connection handshake
3. **`SyncManager`** — Bridges game events ↔ network messages
4. **`LobbyMenu`** — Room creation, joining, and player readiness UI

### Architectural Impact

*   **Infrastructure Layer**: `WebRTCAdapter` replaces `WebSocketAdapter` as the PvP transport. Both implement `INetworkAdapter`.
*   **Presentation Layer**: New `LobbyMenu` component for matchmaking. Geek Stats indicator driven by peer connection state.
*   **Application Layer**: `GameLoop` gains a `LOBBY` state. `SyncManager` handles game event synchronization.

> [!TIP]  
> The `INetworkAdapter` interface was designed to be transport-agnostic. Swapping WebSocket → WebRTC requires only a new adapter class — zero changes to `NetworkManager`, `SyncManager`, or the UI.

