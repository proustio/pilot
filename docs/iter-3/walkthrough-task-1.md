# Walkthrough — Geek Stats HUD (Iter-3, Task 1)

## Changes Made

| File | Change |
|------|--------|
| [Config.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/infrastructure/config/Config.ts) | Renamed `showFpsCounter` → `showGeekStats` |
| [main.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/main.ts) | Dispatches `UPDATE_GEEK_STATS` with `fps`, `frameTime`, `matchStartTime`; records match start timestamp |
| [HUD.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/hud/HUD.ts) | Replaced inline FPS div with structured Geek Stats panel (bottom-left); listens for new events |
| [Settings.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/settings/Settings.ts) | Toggle renamed to "Show Geek Stats", wired to `TOGGLE_GEEK_STATS` |
| [style.css](file:///Users/alx/code/repos/praust/2-battlehsips/src/style.css) | Added `.geek-stats-panel` styles (monospace, dark translucent bg, two-column layout) |

## Verification

Toggled "Show Geek Stats" in Settings → panel appeared in bottom-left with live FPS, frame time, RAM, status, and elapsed game time.

![Geek Stats panel visible in the bottom-left corner](/Users/alx/.gemini/antigravity/brain/c2b65a4a-6dcb-4efa-b124-d54b67701695/geek_stats_hud_visible_1773251563846.png)

![Browser recording of the full verification flow](/Users/alx/.gemini/antigravity/brain/c2b65a4a-6dcb-4efa-b124-d54b67701695/geek_stats_verify_1773251500653.webp)
