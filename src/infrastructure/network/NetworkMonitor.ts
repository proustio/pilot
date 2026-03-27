import { eventBus, GameEventType } from '../../application/events/GameEventBus';

export type ConnectionStatus = 'ONLINE' | 'OFFLINE';

const PING_INTERVAL_MS = 5000;

/**
 * Singleton that tracks whether the serving origin is reachable.
 * 
 * Uses two signals:
 * 1. navigator.onLine (fast path — if browser has no network, we're definitely offline)
 * 2. Periodic fetch to origin (detects "server stopped but WiFi is on")
 * 
 * Emits CONNECTION_STATUS_CHANGED on the GameEventBus when state flips.
 */
export class NetworkMonitor {
    private static instance: NetworkMonitor | null = null;
    private status: ConnectionStatus;

    private constructor() {
        this.status = navigator.onLine ? 'ONLINE' : 'OFFLINE';

        // Fast path: browser lost all connectivity
        window.addEventListener('online', () => this.checkServer());
        window.addEventListener('offline', () => this.setStatus('OFFLINE'));

        // Active server probe
        this.startPinging();
    }

    public static getInstance(): NetworkMonitor {
        if (!NetworkMonitor.instance) {
            NetworkMonitor.instance = new NetworkMonitor();
        }
        return NetworkMonitor.instance;
    }

    private startPinging(): void {
        // Initial check after a short delay (let SW register first)
        setTimeout(() => this.checkServer(), 1000);
        setInterval(() => this.checkServer(), PING_INTERVAL_MS);
    }

    private async checkServer(): Promise<void> {
        if (!navigator.onLine) {
            this.setStatus('OFFLINE');
            return;
        }

        try {
            // HEAD request to /ping.txt — SW is configured to never cache this
            const response = await fetch('./ping.txt', {
                method: 'HEAD',
                cache: 'no-store',
                signal: AbortSignal.timeout(3000)
            });
            this.setStatus(response.ok ? 'ONLINE' : 'OFFLINE');
        } catch {
            // Network error or timeout → server unreachable
            this.setStatus('OFFLINE');
        }
    }

    private setStatus(newStatus: ConnectionStatus): void {
        if (this.status !== newStatus) {
            this.status = newStatus;
            eventBus.emit(GameEventType.CONNECTION_STATUS_CHANGED, { status: newStatus });
        }
    }

    public getStatus(): ConnectionStatus {
        return this.status;
    }
}
