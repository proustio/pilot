import { eventBus, GameEventType } from '../../application/events/GameEventBus';
import { ConnectionState } from './INetworkAdapter';
import { WebSocketAdapter } from './WebSocketAdapter';

/**
 * Singleton that manages the persistent server connection and exposes
 * connection state to the rest of the application via GameEventBus.
 * 
 * Replaces the old HTTP-polling NetworkMonitor.
 * 
 * Behavior:
 * - If serverUrl is configured: connects via WebSocket, auto-reconnects.
 * - If serverUrl is null: stays DISCONNECTED forever (offline mode).
 * - Game is fully playable in all states — connection is purely additive.
 */
export class NetworkManager {
    private static instance: NetworkManager | null = null;
    private adapter: WebSocketAdapter;
    private state: ConnectionState = 'DISCONNECTED';
    private serverUrl: string | null;

    private constructor(serverUrl: string | null) {
        this.serverUrl = serverUrl;
        this.adapter = new WebSocketAdapter();

        this.adapter.onStateChange((newState) => {
            this.state = newState;
            eventBus.emit(GameEventType.CONNECTION_STATUS_CHANGED, { status: newState });
        });

        if (this.serverUrl) {
            this.adapter.connect(this.serverUrl);
        }
    }

    public static init(serverUrl: string | null): NetworkManager {
        if (!NetworkManager.instance) {
            NetworkManager.instance = new NetworkManager(serverUrl);
        }
        return NetworkManager.instance;
    }

    public static getInstance(): NetworkManager {
        if (!NetworkManager.instance) {
            // Default to disconnected if init() was never called
            NetworkManager.instance = new NetworkManager(null);
        }
        return NetworkManager.instance;
    }

    /** Send a game action to the server. No-op if disconnected. */
    public send(type: string, payload: unknown): void {
        this.adapter.send(type, payload);
    }

    /** Register a handler for messages received from the server. */
    public onMessage(handler: (type: string, payload: unknown) => void): void {
        this.adapter.onMessage(handler);
    }

    /** Current connection state. */
    public getStatus(): ConnectionState {
        return this.state;
    }

    /** Attempt connection to a new server URL. */
    public connectTo(serverUrl: string): void {
        this.adapter.disconnect();
        this.serverUrl = serverUrl;
        this.adapter.connect(serverUrl);
    }

    /** Disconnect from the server. */
    public disconnect(): void {
        this.adapter.disconnect();
    }
}
