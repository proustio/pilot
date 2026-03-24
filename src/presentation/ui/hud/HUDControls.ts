import { Config } from '../../../infrastructure/config/Config';

/**
 * Binds all switchboard button event listeners (Peek, Geek Stats, Auto-Battler, Day/Night, Cam-Reset, Speed, FPS, Settings).
 * Also handles Mouse Coord hover tooltips and Geek Stats live updates via CustomEvents.
 */
export function bindHUDControls(container: HTMLElement): void {
    // 1. Settings button
    const settingsBtn = container.querySelector('#hud-btn-settings') as HTMLButtonElement;
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('SHOW_PAUSE_MENU'));
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
            document.dispatchEvent(new CustomEvent('TOGGLE_PEEK', { detail: { peeking: isPeeking } }));
        });

        // External control for peek (when switching turns)
        document.addEventListener('PEEK_ENABLED_CHANGED', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail && ce.detail.enabled !== undefined) {
                peekBtn.style.display = ce.detail.enabled ? 'inline-block' : 'none';
                if (!ce.detail.enabled && isPeeking) {
                    isPeeking = false;
                    peekBtn.classList.remove('active');
                    peekLed.classList.remove('on-blue');
                    document.dispatchEvent(new CustomEvent('TOGGLE_PEEK', { detail: { peeking: false } }));
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
            document.dispatchEvent(new CustomEvent('TOGGLE_GEEK_STATS', { detail: { show: Config.visual.showGeekStats } }));
        });

        document.addEventListener('TOGGLE_GEEK_STATS', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.show !== undefined && geekStatsPanel) {
                geekStatsPanel.style.display = customEvent.detail.show ? 'block' : 'none';
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
            document.dispatchEvent(new CustomEvent('TOGGLE_AUTO_BATTLER', { detail: { enabled: Config.autoBattler } }));
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
            document.dispatchEvent(new CustomEvent('SET_GAME_SPEED', { detail: { speed: nextSpeed.toFixed(1) } }));
        });

        document.addEventListener('SET_GAME_SPEED', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.speed) {
                const speed = parseFloat(customEvent.detail.speed);
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
            document.dispatchEvent(new CustomEvent('SET_FPS_CAP', { detail: { fpsCap: nextFps } }));
        });

        document.addEventListener('SET_FPS_CAP', (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.fpsCap) {
                fpsBtn.innerHTML = `${customEvent.detail.fpsCap}<br>`;
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
            document.dispatchEvent(new CustomEvent('TOGGLE_DAY_NIGHT', { detail: { isDay: Config.visual.isDayMode } }));
            document.dispatchEvent(new CustomEvent('THEME_CHANGED'));
        });
    }

    // 8. Camera Reset
    const camResetBtn = container.querySelector('#hud-btn-cam-reset') as HTMLButtonElement;
    const camResetLed = container.querySelector('#led-cam-reset') as HTMLElement;
    if (camResetBtn && camResetLed) {
        camResetBtn.addEventListener('click', () => {
            camResetLed.classList.add('on-gold');
            document.dispatchEvent(new CustomEvent('RESET_CAMERA'));
            setTimeout(() => camResetLed.classList.remove('on-gold'), 500);
        });
    }

    // 9. Geek Stats update listener
    document.addEventListener('UPDATE_GEEK_STATS', (e: Event) => {
        const customEvent = e as CustomEvent;
        const d = customEvent.detail;
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
    });

    // 10. Mouse Coordination tooltip
    const mouseCoordsEl = container.querySelector('#mouse-coords') as HTMLElement;
    if (mouseCoordsEl) {
        document.addEventListener('MOUSE_CELL_HOVER', (e: Event) => {
            const ce = e as CustomEvent;
            if (ce.detail) {
                const { x, z, clientX, clientY } = ce.detail;
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
