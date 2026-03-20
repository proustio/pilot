# Changes Tasks — Multiplayer PvP (10)

> Reference: `docs/change-summary-10.md`  
> Codebase context: `src/` (DDD layering, Three.js + TypeScript, Vite)

---

## 10. Multiplayer PvP

> **Scope note**: Scaffolding only this sprint. No backend server is required to complete these items.

---

### 10.1 — Networking Layer Scaffold

**New files:**
- `src/infrastructure/network/INetworkAdapter.ts`
- `src/infrastructure/network/WebSocketAdapter.ts`

- [ ] **Define `INetworkAdapter` interface**:
  ```ts
  interface INetworkAdapter {
    connect(serverUrl: string): Promise<void>;
    send(event: string, payload: unknown): void;
    onMessage(handler: (event: string, payload: unknown) => void): void;
    disconnect(): void;
  }
  ```
- [ ] **Implement `WebSocketAdapter`** using the native browser `WebSocket` API conforming to the interface above.
- [ ] **Acceptance**: `WebSocketAdapter` connects to a local echo server and successfully round-trips a JSON test message.

---

### 10.2 — Game State Sync Manager

**New file:** `src/infrastructure/network/SyncManager.ts`

- [ ] **`SyncManager`** wraps `INetworkAdapter` and bridges game events to network messages:
  - **Outbound**: Subscribes to `ATTACK_RESULT`, `SHIP_PLACED`, `ROGUE_MOVE_SHIP` on `document`; serializes to JSON and calls `adapter.send()`.
  - **Inbound**: On `adapter.onMessage()`, deserializes and re-dispatches as `CustomEvent` on `document`.
- [ ] **Turn authority protocol stub**: Document (as JSDoc) the intended server-as-authoritative approach — clients send "intent"; server confirms and rebroadcasts.
- [ ] **Acceptance**: Two browser tabs connected to a local Node echo server can exchange attack events via `SyncManager`.

---

### 10.3 — Lobby & Invite UI

**New file:** `src/presentation/ui/menu/LobbyMenu.ts`  
**Modified:** `src/styles/*.css`, `src/presentation/ui/UIManager.ts`

- [ ] **`LobbyMenu`** (extends `BaseUIComponent`), rendered in `#ui-layer`:
  - "Create Room" button — generates a short room code (UUID prefix) and displays it.
  - "Join Room" input + button — accepts a room code entered by the user.
  - Player slots list (2 entries; shows "Waiting…" until both players connect).
  - "Start Game" button — enabled only when `playerCount === 2`.
- [ ] **Style**: Follow the retro industrial aesthetic from `style.css` (use existing CSS variables and component patterns).
- [ ] **Add `LOBBY` to `GameState` enum** in `GameLoop.ts`; show `LobbyMenu` via `UIManager` when state is `LOBBY`.
- [ ] **Wire "Multiplayer" option in `MainMenu`** to transition to `GameState.LOBBY`.
- [ ] **Acceptance**: Lobby screen renders correctly and invite-code controls are functional UI-side (no backend required).
