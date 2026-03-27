export type ConnectionState = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';

/**
 * Transport-agnostic network adapter interface.
 * Aligned with PvP docs §10.1 — implementations can use WebSocket, WebRTC, or polling.
 */
export interface INetworkAdapter {
    /** Initiate connection to the given server URL. */
    connect(serverUrl: string): Promise<void>;

    /** Send a typed message to the server. */
    send(type: string, payload: unknown): void;

    /** Register a handler for incoming messages. */
    onMessage(handler: (type: string, payload: unknown) => void): void;

    /** Register a handler for connection state changes. */
    onStateChange(handler: (state: ConnectionState) => void): void;

    /** Gracefully close the connection. */
    disconnect(): void;

    /** Current connection state. */
    getState(): ConnectionState;
}
