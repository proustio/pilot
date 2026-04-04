# Fix FPS Drops During Ship Placement (Setup Phase)

## Step 0: Decompose EntityManager (605 → ~430 lines)

Extract animation-state tracking into a new **`AnimationStateTracker`** class. This concentrates the hot-path logic where perf fixes need to go and brings EntityManager under the 400-line guideline.

### [NEW] `AnimationStateTracker.ts`

Owns:
- `activelySinkingShips`, `activelyMovingShips`, `activelyRotatingShips` arrays
- `activeSonarEffects` array
- `isBusy()` — with setup-phase guard (Bottleneck 1 fix baked in)
- `updateTurretTransforms()` — syncs turret instance matrices for moving/sinking/rotating ships
- `updateRammingRotations()` — smooth 90° rotation animations
- `updateCameraShake()` — sinusoidal camera shake decay
- `updateStaticAnimations()` — LED mesh pulsing
- `updateSonarEffects()` — sonar effect tick/cleanup
- Camera shake state (`elapsed`, `duration`, `intensity`)
- LED mesh + phases reference

### [MODIFY] `EntityManager.ts`

- Delegate to `AnimationStateTracker` for all extracted responsibilities
- Register events (`SHIP_STARTED_SINKING`, `ROGUE_SHIP_RAMMED`, `ROGUE_PATH_MOVE` animation array pushes) through the tracker
- `update()` calls `tracker.update(...)` instead of individual methods

---

## Step 1: Setup-phase guard in AnimationStateTracker

`isBusy()` returns `false` immediately when `isSetupPhase` is true.

## Step 2: Skip animation traversals during setup (ShipAnimator)

- `updateShipAnimations()`: early-return when setup
- `updateShipHighlighting()`: early-return when setup  
- Hoist `THREE.Color` allocations to `static readonly` fields

## Step 3: Eliminate per-hover allocation (InputFeedbackHandler)

Reuse class-level `_ghostWorldPos` Vector3.

## Step 4: Skip enemy visibility during setup (VesselVisibilityManager)

Add `isSetupPhase` flag, skip `updateEnemyShipVisibility()` when true.

## Verification

- `npm run build` — no TS errors
- Browser: Rogue mode FPS stable during placement
- Ghost preview, fog, ship placement all functional
- Classic/Russian modes unaffected
