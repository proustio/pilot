import { INetworkAdapter, ConnectionState } from './INetworkAdapter';

/** Wire protocol envelope. */
interface NetworkMessage {
    type: string;
    payload: unknown;
    requestId?: string;
}

const INITIAL_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 16000;
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * WebSocket implementation of INetworkAdapter.
 * 
 * Features:
 * - Auto-reconnect with exponential backoff + jitter
 * - Heartbeat ping every 30s to detect zombie connections
 * - Typed message protocol: { type, payload, requestId? }
 */
export class WebSocketAdapter implements INetworkAdapter {
    private ws: WebSocket | null = null;
    private serverUrl: string = '';
    private state: ConnectionState = 'DISCONNECTED';
    private messageHandlers: Array<(type: string, payload: unknown) => void> = [];
    private stateHandlers: Array<(state: ConnectionState) => void> = [];

    private reconnectDelay: number = INITIAL_RECONNECT_MS;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private intentionalClose: boolean = false;

    public async connect(serverUrl: string): Promise<void> {
        this.serverUrl = serverUrl;
        this.intentionalClose = false;
        this.doConnect();
    }

    private doConnect(): void {
        if (this.state === 'CONNECTED' || this.state === 'CONNECTING') return;

        this.setState('CONNECTING');

        try {
            this.ws = new WebSocket(this.serverUrl);
        } catch {
            // Invalid URL or blocked — schedule reconnect
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this.setState('CONNECTED');
            this.reconnectDelay = INITIAL_RECONNECT_MS;
            this.startHeartbeat();
        };

        this.ws.onmessage = (event: MessageEvent) => {
            try {
                const msg: NetworkMessage = JSON.parse(event.data);
                if (msg.type === 'pong') return; // heartbeat response, ignore

                for (const handler of this.messageHandlers) {
                    handler(msg.type, msg.payload);
                }
            } catch {
                console.warn('[WS] Failed to parse message:', event.data);
            }
        };

        this.ws.onclose = () => {
            this.stopHeartbeat();
            this.setState('DISCONNECTED');
            if (!this.intentionalClose) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = () => {
            // onclose will fire after onerror — reconnect handled there
        };
    }

    public send(type: string, payload: unknown): void {
        if (this.state !== 'CONNECTED' || !this.ws) return;

        const msg: NetworkMessage = { type, payload };
        try {
            this.ws.send(JSON.stringify(msg));
        } catch {
            console.warn('[WS] Failed to send:', type);
        }
    }

    public onMessage(handler: (type: string, payload: unknown) => void): void {
        this.messageHandlers.push(handler);
    }

    public onStateChange(handler: (state: ConnectionState) => void): void {
        this.stateHandlers.push(handler);
    }

    public disconnect(): void {
        this.intentionalClose = true;
        this.clearReconnectTimer();
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.setState('DISCONNECTED');
    }

    public getState(): ConnectionState {
        return this.state;
    }

    // --- Internal ---

    private setState(newState: ConnectionState): void {
        if (this.state === newState) return;
        this.state = newState;
        for (const handler of this.stateHandlers) {
            handler(newState);
        }
    }

    private scheduleReconnect(): void {
        this.clearReconnectTimer();
        // Exponential backoff with ±25% jitter
        const jitter = this.reconnectDelay * (0.75 + Math.random() * 0.5);
        this.reconnectTimer = setTimeout(() => {
            this.state = 'DISCONNECTED'; // Reset so doConnect proceeds
            this.doConnect();
        }, jitter);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_MS);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            this.send('ping', {});
        }, HEARTBEAT_INTERVAL_MS);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
}
