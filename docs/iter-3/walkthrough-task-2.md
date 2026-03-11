# Walkthrough — Iteration 3

## Task 1: Geek Stats HUD ✅

Replaced the inline FPS counter with a styled Geek Stats panel at bottom-left, showing FPS, frame time, RAM, connection status, and game time. Togglable via Settings.

| File | Change |
|------|--------|
| [Config.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/infrastructure/config/Config.ts) | `showFpsCounter` → `showGeekStats` |
| [main.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/main.ts) | `UPDATE_GEEK_STATS` with fps/frameTime/matchStartTime |
| [HUD.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/hud/HUD.ts) | New `#geek-stats` panel |
| [Settings.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/settings/Settings.ts) | Toggle renamed |
| [style.css](file:///Users/alx/code/repos/praust/2-battlehsips/src/style.css) | `.geek-stats-panel` styles |

![Geek Stats panel in bottom-left corner](/Users/alx/.gemini/antigravity/brain/c2b65a4a-6dcb-4efa-b124-d54b67701695/geek_stats_hud_visible_1773251563846.png)

---

## Task 2: Save & Load System ✅

Built a working 3-slot save/load system with proper Ship/Board serialisation, accessible from both Main Menu ("Game Saves") and Pause Menu. Added "Exit to Main Menu" with unsaved-progress warning.

| File | Change |
|------|--------|
| [Storage.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/infrastructure/storage/Storage.ts) | Full rewrite — proper serialise/deserialise with metadata |
| [SaveLoadDialog.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/components/SaveLoadDialog.ts) | **[NEW]** Reusable modal with save/load modes, 3 slots, overwrite confirm |
| [MainMenu.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/menu/MainMenu.ts) | "Game Saves" button → load dialog |
| [Settings.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/settings/Settings.ts) | Save, Load, Exit to Main Menu buttons; unsaved-progress confirm |
| [GameLoop.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/application/game-loop/GameLoop.ts) | [hasUnsavedProgress()](file:///Users/alx/code/repos/praust/2-battlehsips/src/application/game-loop/GameLoop.ts#112-121), `SAVE_GAME`/`LOAD_GAME` events, auto-load |
| [UIManager.ts](file:///Users/alx/code/repos/praust/2-battlehsips/src/presentation/ui/UIManager.ts) | Dialog mounting, event wiring, sessionStorage auto-load |
| [style.css](file:///Users/alx/code/repos/praust/2-battlehsips/src/style.css) | Save/load dialog + confirm overlay styles |

````carousel
![Pause menu with Save/Load/Exit buttons](/Users/alx/.gemini/antigravity/brain/c2b65a4a-6dcb-4efa-b124-d54b67701695/pause_menu_save_load.png)
<!-- slide -->
![Save Game dialog with 3 slots](/Users/alx/.gemini/antigravity/brain/c2b65a4a-6dcb-4efa-b124-d54b67701695/.system_generated/click_feedback/click_feedback_1773252741295.png)
<!-- slide -->
![Main Menu with Game Saves button](/Users/alx/.gemini/antigravity/brain/c2b65a4a-6dcb-4efa-b124-d54b67701695/.system_generated/click_feedback/click_feedback_1773252683015.png)
````

![Full Save/Load verification recording](/Users/alx/.gemini/antigravity/brain/c2b65a4a-6dcb-4efa-b124-d54b67701695/save_load_verify_1773252661669.webp)
