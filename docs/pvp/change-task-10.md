# Changes Tasks — Multiplayer PvP (10)

> Reference: `docs/change-summary-10.md`  
> Codebase context: `src/` (DDD layering, Three.js + TypeScript, Vite)

---

## 10. Multiplayer PvP

> **Architecture**: Serverless, peer-to-peer via **WebRTC DataChannels**. No dedicated game server.  
> **Signaling**: Manual exchange via QR code or room code (PeerJS / Firebase free tier).

---

### 10.0 — Networking Infrastructure (DONE)

**Existing files:**
- `src/infrastructure/network/INetworkAdapter.ts`
- `src/infrastructure/network/WebSocketAdapter.ts`
- `src/infrastructure/network/NetworkManager.ts`

- [x] **`INetworkAdapter` interface** — `connect`, `send`, `onMessage`, `onStateChange`, `disconnect`, `getState`
- [x] **`WebSocketAdapter`** — Reference implementation with auto-reconnect + heartbeat
- [x] **`NetworkManager`** — Singleton coordinator, bridges connection state to `GameEventBus`
- [x] **`CONNECTION_STATUS_CHANGED`** event in `GameEventBus` — 3 states: `CONNECTED | CONNECTING | DISCONNECTED`
- [x] **Geek Stats indicator** — Shows `LOCAL` in PVE, ready for live connection state in PvP
- [x] **PWA / Service Worker** — Game fully playable offline after first load

---

### 10.1 — WebRTC Adapter

**New file:** `src/infrastructure/network/WebRTCAdapter.ts`

- [ ] **Implement `WebRTCAdapter`** conforming to `INetworkAdapter`:
  - Uses `RTCPeerConnection` + `RTCDataChannel` for peer-to-peer data transfer
  - Handles ICE candidate gathering and exchange
  - Uses free STUN servers (e.g. `stun:stun.l.google.com:19302`) for NAT traversal
  - Exposes `createOffer()` / `acceptOffer()` / `createAnswer()` for signaling
- [ ] **Acceptance**: Two browser tabs can exchange JSON messages peer-to-peer with no server.

---

### 10.2 — Signaling & Matchmaking UI

**New file:** `src/presentation/ui/menu/LobbyMenu.ts`  
**Modified:** `src/styles/*.css`, `src/presentation/ui/UIManager.ts`

- [ ] **Signaling mechanism** — choose one or both:
  - **QR Code**: Encode SDP offer as QR → scan → exchange answer QR → connected (like Bluetooth pairing)
  - **Room Code**: Short 4-6 char code via PeerJS cloud or Firebase free tier (only for signaling handshake)
- [ ] **`LobbyMenu`** (extends `BaseUIComponent`):
  - "Create Room" — generates room/QR code and waits for peer
  - "Join Room" — accepts room code or scans QR
  - Player slots (2 entries — shows "Waiting…" until peer connects)
  - "Start Game" — enabled when both peers are connected
- [ ] **Style**: Follow retro industrial aesthetic (existing CSS variables and component patterns)
- [ ] **Add `LOBBY` to `GameState` enum** in `GameLoop.ts`
- [ ] **Wire "Multiplayer" option in `MainMenu`** to transition to `GameState.LOBBY`
- [ ] **Acceptance**: Two browsers can establish a peer connection via the lobby UI.

---

### 10.3 — Game State Sync Manager

**New file:** `src/infrastructure/network/SyncManager.ts`

- [ ] **`SyncManager`** wraps `INetworkAdapter` and bridges game events to network messages:
  - **Outbound**: Subscribes to game action events on `GameEventBus`; serializes and calls `adapter.send()`
  - **Inbound**: On `adapter.onMessage()`, deserializes and re-dispatches on `GameEventBus`
- [ ] **Turn authority protocol**: Document the intended approach — one peer acts as "host" (validates moves), both peers render independently
- [ ] **Acceptance**: Two browsers connected via WebRTC can exchange attack events through `SyncManager`.

