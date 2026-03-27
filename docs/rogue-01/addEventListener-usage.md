# Detailed addEventListener Usage Report

This document provides a serial, one-by-one audit of every `addEventListener` call in the `src/` directory.

## src/main.ts
1. **L212**: `window.addEventListener('resize', ...)`
   - **Status**: **Remain (Feeder)**
   - **Rationale**: Acts as the primary entry point to capture browser window resizing and broadcast it as `GameEventType.WINDOW_RESIZE` on the bus.
2. **L219**: `document.addEventListener('keydown', ...)`
   - **Status**: **Remain (Feeder)**
   - **Rationale**: Captures all keyboard input to broadcast `GameEventType.DOCUMENT_KEYDOWN`.
3. **L223**: `document.addEventListener('click', ...)`
   - **Status**: **Remain (Feeder)**
   - **Rationale**: Captures all document clicks to broadcast `GameEventType.DOCUMENT_CLICK`.
4. **L233**: `window.addEventListener('mousedown', ...)`
   - **Status**: **Remain (Feeder)**
   - **Rationale**: Part of the one-time "Global Interaction" detection to resume the AudioEngine.
5. **L234**: `window.addEventListener('keydown', ...)`
   - **Status**: **Remain (Feeder)**
   - **Rationale**: Part of the one-time "Global Interaction" detection to resume the AudioEngine.
6. **L240**: `window.addEventListener('beforeunload', ...)`
   - **Status**: **Remain**
   - **Rationale**: Web-standard lifecycle event for triggering auto-save before the tab closes.
7. **L280**: `document.addEventListener('DOMContentLoaded', ...)`
   - **Status**: **Remain**
   - **Rationale**: Standard browser entry point for application initialization.

## src/application/events/GameEventBus.ts
8. **L171**: `this.eventTarget.addEventListener(type, handler)`
   - **Status**: **Remain (Core)**
   - **Rationale**: This is the internal implementation of the `GameEventBus` itself.

## src/presentation/ui/pause/PauseMenu.ts
9. **L39**: `resumeBtn.addEventListener('click', ...)`
   - **Status**: **Remain (Local)**
   - **Rationale**: Local UI button handler for hiding the menu.
10. **L43**: `saveBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI button handler; emits `SHOW_SAVE_DIALOG` to the bus.
11. **L50**: `loadBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI button handler; emits `SHOW_LOAD_DIALOG` to the bus.
12. **L57**: `settingsBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI button handler; emits `SHOW_SETTINGS` to the bus.
13. **L64**: `exitBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI button handler for confirmed exit.
14. **L72**: `yesBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI button handler for exit confirmation.
15. **L78**: `noBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI button handler for exit cancellation.

## src/presentation/ui/settings/VideoSettings.ts
16. **L108**: `toggleHud.addEventListener('change', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI toggle; emits `TOGGLE_HUD` to the bus.
17. **L116**: `toggleGeekStats.addEventListener('change', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI toggle; emits `TOGGLE_GEEK_STATS` to the bus.
18. **L143**: `picker.addEventListener('input', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI color picker; updates `Config` directly.

## src/presentation/ui/settings/KeybindingEditor.ts
19. **L42**: `openKeybindingsBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI navigation within the settings panel.
20. **L49**: `closeKeybindingsBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI navigation within the settings panel.
21. **L55**: `resetKeybindingsBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local action for resetting config.
22. **L121**: `btn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local list item interaction for removing binds.
23. **L131**: `btn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local list item interaction for adding binds.

## src/presentation/ui/settings/GeneralSettings.ts
24. **L92**: `autoBattlerToggle.addEventListener('change', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI toggle; updates `Config` and emits `TOGGLE_AUTO_BATTLER`.

## src/presentation/ui/settings/Settings.ts
25. **L77**: `closeBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI button to hide settings.
26. **L121**: `selected.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local dropdown UI logic.
27. **L134**: `option.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local dropdown UI logic.
28. **L148**: `this.container.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Outside click handler specifically for settings dropdowns.

## src/presentation/ui/settings/AudioSettings.ts
29. **L26**: `volumeSlider.addEventListener('input', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local range input; updates `AudioEngine` in real-time.

## src/presentation/ui/components/SaveLoadDialog.ts
30. **L84**: `closeBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local UI button to hide dialog.
31. **L88**: `btn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Slot selection; emits `SAVE_GAME` or `LOAD_GAME`.
32. **L112**: `btn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local delete button for save slots.
33. **L140**: `yesBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Confirm dialog button.
34. **L141**: `noBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Confirm dialog button.

## src/presentation/ui/menu/GameOver.ts
35. **L19**: `restartBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Hard reloads the page for a clean session.
36. **L24**: `exitBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Returns to main menu state.

## src/presentation/ui/menu/MainMenu.ts
37. **L128**: `selectedEl.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local dropdown UI logic.
38. **L134**: `opt.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local dropdown UI logic.
39. **L209**: `newGameBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Starts the game session.
40. **L247**: `gameSavesBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Emits `SHOW_LOAD_DIALOG`.
41. **L252**: `settingsBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Emits `SHOW_SETTINGS`.

## src/presentation/ui/hud/UnifiedBoardUI.ts
42. **L103**: `cell.addEventListener('mouseenter', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: High-performance local hover tracking for the minimap.
43. **L104**: `cell.addEventListener('mousemove', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: High-performance local mouse tracking for the minimap.
44. **L105**: `cell.addEventListener('mouseleave', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Minimap state cleanup.
45. **L109**: `cell.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Minimap tile interaction.

## src/presentation/ui/hud/HUD.ts
46. **L160**: `skipBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Skip turn button interaction.
47. **L209**: `moveBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local tab switching logic.
48. **L210**: `attackBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Local tab switching logic.
49. **L274**: `btn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: Selection logic for Rogue mode weapons/abilities.

## src/presentation/ui/hud/HUDControls.ts
50. **L12**: `settingsBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
    - **Rationale**: All HUD buttons act as local triggers that then broadcast specific events to the `GameEventBus`.
51. **L22**: `peekBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
52. **L48**: `geekStatsBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
53. **L66**: `autoBattlerBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
54. **L78**: `speedBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
55. **L103**: `fpsBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
56. **L127**: `dayNightBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**
57. **L142**: `camResetBtn.addEventListener('click', ...)`
    - **Status**: **Remain (Local)**

## src/presentation/3d/Engine3D.ts
58. **L64**: `this.orbitControls.addEventListener('change', ...)`
    - **Status**: **Remain**
    - **Rationale**: Internal Three.js camera controller signal for damping/persistence.
59. **L75**: `this.orbitControls.addEventListener('start', ...)`
    - **Status**: **Remain**
    - **Rationale**: Signal to block interactions during camera movements.
60. **L79**: `this.orbitControls.addEventListener('end', ...)`
    - **Status**: **Remain**
    - **Rationale**: Signal to resume interactions after camera movements.
61. **L84**: `this.renderer.domElement.addEventListener('pointerdown', ...)`
    - **Status**: **Remain**
    - **Rationale**: Critical high-performance entry point for 3D coordinate detection.

## src/presentation/3d/interaction/InteractionManager.ts
62. **L37**: `window.addEventListener('mousemove', ...)`
    - **Status**: **Remain**
    - **Rationale**: Global mouse tracking source for the 3D raycasting system.
63. **L38**: `window.addEventListener('click', ...)`
    - **Status**: **Remain**
    - **Rationale**: Global click source for the 3D raycasting system.

---
**Summary**: 63 total instances of `addEventListener` were reviewed. All instances are appropriately categorized as either "Global Feeders" for the bus, internal library signals (Three.js), or encapsulated local UI interactions. No further migrations are required at this time.
