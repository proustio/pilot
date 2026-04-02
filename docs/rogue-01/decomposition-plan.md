# Code Decomposition Plan

This document outlines the current state of large files in the `src` directory and provides a strategic approach for decomposing them to improve readability and maintainability, in alignment with our technical steering guidelines.

## Heaviest Files Tree (Post-Refactor Status)

```text
src/
├── application/
│   └── game-loop/
│       ├── GameLoop.ts (296) - COMPLETED
│       ├── TurnExecutor.ts (318) - STABLE
│       └── MatchSetup.ts (206) - STABLE
├── presentation/
│   ├── 3d/
│   │   ├── entities/
│   │   │   ├── EntityManager.ts (367) - COMPLETED
│   │   │   ├── BoardBuilder.ts (450) - PENDING
│   │   │   ├── ParticleSystem.ts (345) - STABLE
│   │   │   ├── ProjectileManager.ts (327) - STABLE
│   │   │   └── ImpactEffects.ts (324) - STABLE
│   │   └── interaction/
│   │       └── InteractionManager.ts (287) - COMPLETED
│   └── ui/
│       ├── settings/
│       │   └── Settings.ts (177) - COMPLETED
│       └── hud/
│           ├── HUD.ts (324) - STABLE
│           └── HUDControls.ts (279) - STABLE
```

## Status Summary

The primary refactoring goal of decoupling the monolithic `GameLoop` and `EntityManager` has been successfully achieved. 

### Key Milestones Completed:
1. **Responsibility Segregation**:
    - Extracted `GameEventManager` and `RogueActionHandler` from `GameLoop`.
    - Extracted `VesselVisibilityManager` and `WaterShaderManager` from `EntityManager`.
2. **Functional Manager Splitting**:
    - Decomposed `InteractionManager` into `RaycastService` and `InputFeedbackHandler`.
    - Decomposed `Settings` into modular sub-panels (`General`, `Video`, `Audio`, `KeybindingEditor`).
3. **Event-Driven Decoupling**:
    - Centralized all cross-layer communication into the typed `GameEventBus`.
    - Eliminated legacy `document` event listeners, resolving turn-transition and UI sync bugs.

### Remaining Threshold Review:
- `BoardBuilder.ts` (450 lines) remains the only file exceeding the 400-line mandatory threshold. This represents a future candidate for splitting (e.g., into `PlayerBoardBuilder` and `EnemyBoardBuilder` or `StaticAssetBuilder`).
