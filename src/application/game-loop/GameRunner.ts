import { Engine3D } from '../../presentation/3d/Engine3D';
import { EntityManager } from '../../presentation/3d/entities/EntityManager';
import { InteractionManager } from '../../presentation/3d/interaction/InteractionManager';
import { GameLoop } from './GameLoop';
import { UIManager } from '../../presentation/ui/UIManager';
import { Config } from '../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../application/events/GameEventBus';
import { NetworkManager } from '../../infrastructure/network/NetworkManager';

/**
 * Orchestrates the main animation loop, coordinating updates across 
 * various managers and providing performance telemetry.
 */
export class GameRunner {
    private engine: Engine3D;
    private entityManager: EntityManager;
    private interactionManager: InteractionManager;
    private gameLoop: GameLoop;
    private uiManager: UIManager;

    private frameInterval: number;
    private lastFrameTime: number = 0;
    private lastFpsUpdateTime: number = 0;
    private framesRendered: number = 0;
    private lastTotalNetDown: number = 0;

    private totalJsTimeInWindow: number = 0;
    private framesInWindow: number = 0;

    public elapsedActiveTime: number = 0;

    constructor(
        engine: Engine3D,
        entityManager: EntityManager,
        interactionManager: InteractionManager,
        gameLoop: GameLoop,
        uiManager: UIManager
    ) {
        this.engine = engine;
        this.entityManager = entityManager;
        this.interactionManager = interactionManager;
        this.gameLoop = gameLoop;
        this.uiManager = uiManager;

        this.frameInterval = 1000 / (Config.visual.fpsCap || 60);

        eventBus.on(GameEventType.SET_FPS_CAP, (payload: { fpsCap: number }) => {
            if (payload && payload.fpsCap) {
                this.frameInterval = 1000 / payload.fpsCap;
            }
        });
    }

    public start(): void {
        this.lastFrameTime = performance.now();
        this.lastFpsUpdateTime = performance.now();
        requestAnimationFrame((t) => this.animate(t));
    }

    private animate(time: DOMHighResTimeStamp): void {
        const frameStart = performance.now();
        
        // Schedule next frame immediately for consistency
        requestAnimationFrame((t) => this.animate(t));

        const deltaTime = time - this.lastFrameTime;

        // FPS Capping Logics
        if (deltaTime < this.frameInterval - 0.1) {
            return;
        }

        // Timing updates
        this.lastFrameTime = time;
        if (!this.gameLoop.isPaused) {
            this.elapsedActiveTime += deltaTime;
        }

        this.framesRendered++;
        this.framesInWindow++;

        // 1. Logic Updates
        if (!this.gameLoop.isPaused) {
            this.interactionManager.update();
            this.entityManager.update(this.engine.camera);
        }
        
        // 2. UI Updates
        this.uiManager.update();

        // 3. Render
        this.engine.render();

        // Accumulate execution time for CPU load calculation
        const frameEnd = performance.now();
        this.totalJsTimeInWindow += (frameEnd - frameStart);

        // Stats update every 1s
        if (time - this.lastFpsUpdateTime >= 1000) {
            this.updateStats(time);
        }
    }

    private getBrowserEngine(): string {
        const ua = navigator.userAgent;
        if (ua.includes('Firefox')) return 'GECKO';
        if (ua.includes('Chrome')) return 'BLINK';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'WEBKIT';
        return 'UNKNOWN';
    }

    private updateStats(time: number): void {
        const windowDuration = time - this.lastFpsUpdateTime;
        const fpsValue = Math.round((this.framesRendered * 1000) / windowDuration);
        
        // RAM Fallback
        const mem = (performance as any).memory;
        let ramMB: string | undefined;
        if (mem) {
            ramMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
        } else if ((navigator as any).deviceMemory) {
            ramMB = `~${(navigator as any).deviceMemory}GB (Total)`;
        } else {
            ramMB = undefined; // Return undefined if we have no measurement
        }

        // Net tracking
        const totalNetDown = performance.getEntriesByType('resource')
            .reduce((acc, entry) => acc + (entry as PerformanceResourceTiming).transferSize, 0);
        const netDownSpeed = Math.max(0, totalNetDown - this.lastTotalNetDown);
        this.lastTotalNetDown = totalNetDown;

        // CPU Load (Averaged)
        const cpuLoad = Math.min(100, (this.totalJsTimeInWindow / windowDuration) * 100);

        // VSync Detection:
        // Identify if we are stuck on a standard refresh rate boundary (divisor).
        const avgFrameTime = windowDuration / this.framesInWindow;
        let vsyncStatus = 'OFF';
        
        // Potential lock targets (standard monitor refresh rates and their halves)
        const commonLocks = [30, 48, 60, 72, 75, 90, 120, 144, 240];
        
        if (Config.visual.fpsCap > fpsValue + 5 && cpuLoad < 40) {
            const nearestLock = commonLocks.find(lock => Math.abs(fpsValue - lock) <= 2);
            if (nearestLock) {
                vsyncStatus = `${nearestLock}Hz LOCK`;
            }
        }

        eventBus.emit(GameEventType.UPDATE_GEEK_STATS, {
            fps: fpsValue,
            vsync: vsyncStatus,
            frameTime: avgFrameTime,
            ram: ramMB,
            cpuLoad: cpuLoad,
            gpuCalls: this.engine.renderer.info.render.calls,
            gpuTris: this.engine.renderer.info.render.triangles,
            netDown: netDownSpeed,
            elapsedActiveTime: this.elapsedActiveTime,
            zoom: this.engine.orbitControls.getDistance(),
            cameraPos: this.engine.camera.position,
            targetPos: this.engine.orbitControls.target,
            engine: this.getBrowserEngine(),
            status: NetworkManager.getInstance().getStatus()
        });

        this.framesRendered = 0;
        this.framesInWindow = 0;
        this.totalJsTimeInWindow = 0;
        this.lastFpsUpdateTime = time;
    }
}

// End of GameRunner class
