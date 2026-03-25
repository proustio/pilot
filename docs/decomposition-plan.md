# Code Decomposition Plan

This document outlines the current state of large files in the `src` directory and provides a strategic approach for decomposing them to improve readability and maintainability, in alignment with our technical steering guidelines.

## Heaviest Files Tree (Top 5 per Folder > 200 Lines)

```text
src/
├── main.ts (266)
├── application/
│   ├── ai/
│   │   └── AIEngine.ts (229)
│   └── game-loop/
│       ├── GameLoop.ts (600)
│       ├── TurnExecutor.ts (318)
│       └── MatchSetup.ts (206)
├── domain/
│   └── board/
│       └── Board.ts (271)
├── infrastructure/
│   └── storage/
│       └── Storage.ts (233)
└── presentation/
    ├── 3d/
    │   ├── Engine3D.ts (260)
    │   ├── entities/
    │   │   ├── EntityManager.ts (582)
    │   │   ├── BoardBuilder.ts (450)
    │   │   ├── ParticleSystem.ts (345)
    │   │   ├── ProjectileManager.ts (327)
    │   │   └── ImpactEffects.ts (324)
    │   └── interaction/
    │       └── InteractionManager.ts (498)
    └── ui/
        ├── UIManager.ts (216)
        ├── hud/
        │   ├── HUD.ts (326)
        │   ├── HUDControls.ts (284)
        │   └── UnifiedBoardUI.ts (224)
        ├── menu/
        │   └── MainMenu.ts (262)
        └── settings/
            └── Settings.ts (482)
```

## Strategic Approach

Following the modular decomposition guideline (files should be decomposed once they exceed ~300-400 lines or handle multiple distinct responsibilities), we propose the following strategic steps:

### 1. Responsibility Segregation (SRP)
Many of the identified files are "Managers" or "Loops" that have become catch-alls for logic.
- **GameLoop.ts (600 lines)**: Currently manages state transitions, input routing, rogue-mode specific logic, and event listeners.
    - *Action*: Extract `GameEventManager` for event registration and `RogueActionHandler` for rogue-specific movement/ability logic.
- **EntityManager.ts (582 lines)**: Manages 3D groups, sub-managers, water effects, and visibility.
    - *Action*: Extract `VesselVisibilityManager` (handling rogue fog/enemy revealing) and `WaterShaderManager`.

### 2. Functional Manager Splitting
Large presentation managers should delegate to specialized handlers.
- **InteractionManager.ts (498 lines)**: Likely handles raycasting, hovering, and clicking.
    - *Action*: Split into `RaycastService` and `InputFeedbackHandler`.
- **Settings.ts (482 lines)**: Handles UI rendering and state management for game settings.
    - *Action*: Decompose into sub-components (e.g., `VideoSettings`, `AudioSettings`, `KeybindingEditor`).

### 3. Decoupling via Events
To prevent files from growing due to tight coupling (e.g., `GameLoop` knowing about `Storage` and `AIEngine` internals):
- Use a **centralized Event Bus** for cross-cutting concerns (Save/Load, Statistics, UI notifications).
- Ensure `Presentation` layers only interact with `Application` layers via documented event interfaces or clean facades.

### 4. Code Maintenance Thresholds
- **> 200 Lines**: Review for emerging responsibility drift.
- **> 300 Lines**: Begin planning for decomposition.
- **> 400 Lines**: Mandatory decomposition into sub-modules or services.

## Next Steps
1. Prioritize `GameLoop.ts` and `EntityManager.ts` as they significantly exceed the 400-line mandatory threshold.
2. Review `Settings.ts` and `InteractionManager.ts` for extraction of UI/Logic components.
3. Standardize the use of smaller, focused files in `presentation/3d/entities/` which currently holds several large files.
