import { Config } from '../../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

/**
 * Binds all switchboard button event listeners (Peek, Geek Stats, Auto-Battler, Day/Night, Cam-Reset, Speed, FPS, Settings).
 * Also handles Mouse Coord hover tooltips and Geek Stats live updates via CustomEvents.
 */
export function bindHUDControls(container: HTMLElement): void {
    // 1. Settings button
    const settingsBtn = container.querySelector('#hud-btn-settings') as HTMLButtonElement;
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            eventBus.emit(GameEventType.SHOW_PAUSE_MENU, undefined as any);
        });
    }

    // 2. Peek toggle
    const peekBtn = container.querySelector('#hud-btn-peek') as HTMLElement;
    const peekLed = container.querySelector('#led-peek') as HTMLElement;
    let isPeeking = false;
    if (peekBtn && peekLed) {
        peekBtn.addEventListener('click', () => {
            isPeeking = !isPeeking;
            peekBtn.classList.toggle('active', isPeeking);
            peekLed.classList.toggle('on-blue', isPeeking);
            eventBus.emit(GameEventType.TOGGLE_PEEK, { peeking: isPeeking });
        });

        // External control for peek (when switching turns)
        eventBus.on(GameEventType.PEEK_ENABLED_CHANGED, (payload: { enabled: boolean }) => {
            if (payload && payload.enabled !== undefined) {
                peekBtn.style.display = payload.enabled ? 'inline-block' : 'none';
                if (!payload.enabled && isPeeking) {
                    isPeeking = false;
                    peekBtn.classList.remove('active');
                    peekLed.classList.remove('on-blue');
                    eventBus.emit(GameEventType.TOGGLE_PEEK, { peeking: false });
                }
            }
        });
    }

    // 3. Geek Stats toggle
    const geekStatsBtn = container.querySelector('#hud-btn-geek-stats') as HTMLElement;
    const geekStatsLed = container.querySelector('#led-geek-stats') as HTMLElement;
    const geekStatsPanel = container.querySelector('#geek-stats') as HTMLElement;
    if (geekStatsBtn && geekStatsLed) {
        geekStatsBtn.addEventListener('click', () => {
            Config.visual.showGeekStats = !Config.visual.showGeekStats;
            geekStatsBtn.classList.toggle('active', Config.visual.showGeekStats);
            geekStatsLed.classList.toggle('on-gold', Config.visual.showGeekStats);
            eventBus.emit(GameEventType.TOGGLE_GEEK_STATS, { show: Config.visual.showGeekStats });
        });

        eventBus.on(GameEventType.TOGGLE_GEEK_STATS, (payload: { show: boolean }) => {
            if (payload && payload.show !== undefined && geekStatsPanel) {
                geekStatsPanel.style.display = payload.show ? 'block' : 'none';
            }
        });
    }

    // 4. Auto-Battler button
    const autoBattlerBtn = container.querySelector('#hud-btn-auto-battler') as HTMLElement;
    const autoBattlerLed = container.querySelector('#led-auto-battler') as HTMLElement;
    if (autoBattlerBtn && autoBattlerLed) {
        autoBattlerBtn.addEventListener('click', () => {
            Config.autoBattler = !Config.autoBattler;
            autoBattlerBtn.classList.toggle('active', Config.autoBattler);
            autoBattlerLed.classList.toggle('on-red', Config.autoBattler);
            eventBus.emit(GameEventType.TOGGLE_AUTO_BATTLER, { enabled: Config.autoBattler });
        });
    }

    // 5. Game Speed cycling
    const speedBtn = container.querySelector('#hud-btn-speed') as HTMLButtonElement;
    const speedCycle = [0.5, 1.0, 2.0, 4.0];
    if (speedBtn) {
        speedBtn.addEventListener('click', () => {
            let currentIndex = speedCycle.indexOf(Config.timing.gameSpeedMultiplier);
            if (currentIndex === -1) currentIndex = 1;

            const nextIndex = (currentIndex + 1) % speedCycle.length;
            const nextSpeed = speedCycle[nextIndex];

            Config.timing.gameSpeedMultiplier = nextSpeed;
            Config.saveConfig();
            speedBtn.innerText = `${nextSpeed}X`;
            eventBus.emit(GameEventType.SET_GAME_SPEED, { speed: nextSpeed });
        });

        eventBus.on(GameEventType.SET_GAME_SPEED, (payload: { speed: number }) => {
            if (payload && payload.speed) {
                const speed = payload.speed;
                speedBtn.innerText = `${speed}X`;
            }
        });
    }

    // 6. FPS Cap cycling
    const fpsBtn = container.querySelector('#hud-btn-fps') as HTMLButtonElement;
    const fpsCycle = [30, 60, 120, 144, 240];
    if (fpsBtn) {
        fpsBtn.addEventListener('click', () => {
            let currentIndex = fpsCycle.indexOf(Config.visual.fpsCap);
            if (currentIndex === -1) currentIndex = 1;

            const nextIndex = (currentIndex + 1) % fpsCycle.length;
            const nextFps = fpsCycle[nextIndex];

            Config.visual.fpsCap = nextFps;
            Config.saveConfig();
            fpsBtn.innerHTML = `${nextFps}<br>`;
            eventBus.emit(GameEventType.SET_FPS_CAP, { fpsCap: nextFps });
        });

        eventBus.on(GameEventType.SET_FPS_CAP, (payload: { fpsCap: number }) => {
            if (payload && payload.fpsCap) {
                fpsBtn.innerHTML = `${payload.fpsCap}<br>`;
            }
        });
    }

    // 7. Day/Night toggle
    const dayNightBtn = container.querySelector('#hud-btn-day-night') as HTMLButtonElement;
    const dayNightLed = container.querySelector('#led-day-night') as HTMLElement;
    if (dayNightBtn && dayNightLed) {
        dayNightBtn.addEventListener('click', () => {
            Config.visual.isDayMode = !Config.visual.isDayMode;
            Config.saveConfig();
            dayNightBtn.innerText = Config.visual.isDayMode ? '🌘' : '🌖';
            dayNightLed.classList.remove('on-gold', 'on-blue');
            dayNightLed.classList.add(Config.visual.isDayMode ? 'on-gold' : 'on-blue');
            eventBus.emit(GameEventType.TOGGLE_DAY_NIGHT, undefined as any);
            eventBus.emit(GameEventType.THEME_CHANGED, undefined as any);
        });
    }

    // 8. Camera Reset
    const camResetBtn = container.querySelector('#hud-btn-cam-reset') as HTMLButtonElement;
    const camResetLed = container.querySelector('#led-cam-reset') as HTMLElement;
    if (camResetBtn && camResetLed) {
        camResetBtn.addEventListener('click', () => {
            camResetLed.classList.add('on-gold');
            eventBus.emit(GameEventType.RESET_CAMERA, undefined as any);
            setTimeout(() => camResetLed.classList.remove('on-gold'), 500);
        });
    }

    // 9. Geek Stats update listener
    eventBus.on(GameEventType.UPDATE_GEEK_STATS, (payload: any) => {
        const d = payload;
        if (!d || !Config.visual.showGeekStats) return;

        const fpsEl = container.querySelector('#gs-fps');
        const frameEl = container.querySelector('#gs-frame');
        const ramEl = container.querySelector('#gs-ram');
        const cpuEl = container.querySelector('#gs-cpu');
        const gpuCallsEl = container.querySelector('#gs-gpu-calls');
        const gpuTrisEl = container.querySelector('#gs-gpu-tris');
        const netDownEl = container.querySelector('#gs-net-down');
        const netUpEl = container.querySelector('#gs-net-up');
        const zoomEl = container.querySelector('#gs-zoom');
        const posEl = container.querySelector('#gs-pos');
        const tgtEl = container.querySelector('#gs-tgt');
        const engineEl = container.querySelector('#gs-engine');
        const timeEl = container.querySelector('#gs-time');

        const updateRowVisibility = (el: Element | null, value: any) => {
            if (!el) return;
            const row = el.closest('.geek-stats-row') as HTMLElement;
            if (row) {
                // Hide if value is explicitly undefined OR if it's a string starting with "N/A"
                const isNoMeasurement = value === undefined || (typeof value === 'string' && value.startsWith('N/A'));
                row.style.display = isNoMeasurement ? 'none' : 'flex';
            }
        };

        if (fpsEl) {
            const vsync = d.vsync && d.vsync !== 'OFF' ? ` <small style="font-size: 0.6rem; opacity: 0.6; color: #ff0;">(${d.vsync})</small>` : '';
            fpsEl.innerHTML = `${d.fps}${vsync}`;
            updateRowVisibility(fpsEl, d.fps);
        }
        
        if (frameEl) {
            frameEl.textContent = `${d.frameTime.toFixed(1)}ms`;
            updateRowVisibility(frameEl, d.frameTime);
        }

        if (ramEl) {
            ramEl.textContent = d.ram === undefined ? '--' : (d.ram.includes('MB') || d.ram.includes('GB') ? d.ram : `${d.ram} MB`);
            updateRowVisibility(ramEl, d.ram);
        }

        if (cpuEl) {
            cpuEl.textContent = d.cpuLoad !== undefined ? `${d.cpuLoad.toFixed(1)}%` : '-- %';
            updateRowVisibility(cpuEl, d.cpuLoad);
        }

        if (gpuCallsEl && gpuTrisEl) {
            gpuCallsEl.textContent = d.gpuCalls !== undefined ? d.gpuCalls.toString() : '--';
            gpuTrisEl.textContent = d.gpuTris !== undefined ? d.gpuTris.toString() : '--';
            updateRowVisibility(gpuCallsEl, d.gpuCalls);
        }

        const formatBytes = (bytes: number | undefined) => {
            if (bytes === undefined) return '--';
            if (bytes < 1024) return `${bytes} B/s`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
        };

        if (netDownEl) {
            const downSpan = netDownEl.parentElement;
            if (downSpan) downSpan.style.display = d.netDown === undefined || d.netDown === 0 ? 'none' : 'inline';
            netDownEl.textContent = formatBytes(d.netDown);
        }
        if (netUpEl) {
            const upSpan = netUpEl.parentElement;
            if (upSpan) upSpan.style.display = d.netUp === undefined || d.netUp === 0 ? 'none' : 'inline';
            netUpEl.textContent = formatBytes(d.netUp);
        }
        
        // Hide entire net row if both are missing or zero
        if (netDownEl && netUpEl) {
            const row = netDownEl.closest('.geek-stats-row') as HTMLElement;
            if (row) {
                const noDown = d.netDown === undefined || d.netDown === 0;
                const noUp = d.netUp === undefined || d.netUp === 0;
                row.style.display = (noDown && noUp) ? 'none' : 'flex';
            }
        }

        if (zoomEl) {
            zoomEl.textContent = d.zoom !== undefined ? `${d.zoom.toFixed(1)}` : '--';
            updateRowVisibility(zoomEl, d.zoom);
        }

        if (posEl) {
            posEl.textContent = d.cameraPos ? `${d.cameraPos.x.toFixed(1)} ${d.cameraPos.y.toFixed(1)} ${d.cameraPos.z.toFixed(1)}` : '--';
            updateRowVisibility(posEl, d.cameraPos);
        }

        if (tgtEl) {
            tgtEl.textContent = d.targetPos ? `${d.targetPos.x.toFixed(1)} ${d.targetPos.y.toFixed(1)} ${d.targetPos.z.toFixed(1)}` : '--';
            updateRowVisibility(tgtEl, d.targetPos);
        }

        if (engineEl) {
            engineEl.textContent = d.engine || '--';
            updateRowVisibility(engineEl, d.engine);
        }

        if (timeEl) {
            if (d.elapsedActiveTime !== undefined) {
                const elapsedSeconds = Math.floor(d.elapsedActiveTime / 1000);
                const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
                const secs = String(elapsedSeconds % 60).padStart(2, '0');
                timeEl.textContent = `${mins}:${secs}`;
            }
            updateRowVisibility(timeEl, d.elapsedActiveTime);
        }

        const statusEl = container.querySelector('#gs-status');
        if (statusEl && d.status) {
            statusEl.classList.remove('gs-online', 'gs-connecting', 'gs-offline');
            if (d.status === 'CONNECTED') {
                statusEl.textContent = '● CONNECTED';
                statusEl.classList.add('gs-online');
            } else if (d.status === 'CONNECTING') {
                statusEl.textContent = '● CONNECTING';
                statusEl.classList.add('gs-connecting');
            } else {
                // DISCONNECTED — show LOCAL for PVE, DISCONNECTED only during active PvP
                statusEl.textContent = '● LOCAL';
                statusEl.classList.add('gs-online');
            }
        }
    });

    // 10. Mouse Coordination tooltip
    const mouseCoordsEl = container.querySelector('#mouse-coords') as HTMLElement;
    if (mouseCoordsEl) {
        eventBus.on(GameEventType.MOUSE_CELL_HOVER, (payload: any) => {
            if (payload) {
                const { x, z, clientX, clientY } = payload;
                mouseCoordsEl.textContent = `(${x},${z})`;
                mouseCoordsEl.style.left = `${clientX}px`;
                mouseCoordsEl.style.top = `${clientY}px`;
                mouseCoordsEl.style.display = 'block';
            } else {
                mouseCoordsEl.style.display = 'none';
            }
        });
    }
}
