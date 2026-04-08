# ParticleSystem Decomposition Plan

Current `ParticleSystem.ts` is ~650 lines handling pool management, six spawn methods, the update loop, and lifecycle. Split into four files, each under 200 lines.

## Current Responsibilities

1. **Types & config** — `InstancedParticle`, `InstancePool`, `PARTICLE_POOL_CONFIG`, temp helpers
2. **Pool management** — `initPools()`, `allocateSlot()`, `releaseSlot()`, geometry/material allocation
3. **Spawn methods** — `spawnFire()`, `spawnSmoke()`, `spawnExplosion()`, `spawnSplash()`, `spawnVoxelExplosion()`, `spawnFog()`
4. **Update loop** — per-frame physics, color modulation, matrix writes, expiry/recycling
5. **Lifecycle** — `clear()`, `dispose()`, emitter delegation, theme subscription

## Proposed File Split

### 1. `ParticleTypes.ts` (~60 lines)
Shared types, interfaces, pool config, and reusable temp variables.

**Contents:**
- `ParticlePoolType` type alias
- `InstancedParticle` interface
- `InstancePool` interface
- `PARTICLE_POOL_CONFIG` object
- Shared temp variables (`_tempMatrix`, `_tempQuaternion`, `_tempScale`, `_tempColor`, `_white`, `_tempPos`)

**Rationale:** These are pure data definitions with zero logic. Every other file imports from here. Extracting them eliminates circular dependencies and gives a single source of truth for the particle data model.

### 2. `ParticlePoolManager.ts` (~180 lines)
Pool initialization, slot allocation/eviction, geometry and material ownership, and disposal.

**Contents:**
- All shared geometries (`fireGeo`, `smokeGeo`, etc.)
- All shared materials (`fireMat`, `secondaryFireMat`, `greySmokeMat`, etc.)
- `initPools(parentGroup)` — creates `InstancedMesh` instances, builds free lists
- `allocateSlot(pool)` — free-list pop or oldest-eviction against a particles array ref
- `releaseSlot(pool, slot)` — zero-scale matrix, return to free list
- `getPool(type)` / `pools` accessor
- `clear()` — resets all pool state (zero matrices, refill free lists)
- `dispose()` — disposes meshes, geometries, materials
- `poolParent` and `zeroMatrix` references

**Rationale:** Pool lifecycle is a self-contained concern. The slot allocator needs a reference to the live particles array (passed in or shared), but the logic itself is independent of what kind of particle is being spawned. This is the heaviest file but stays under 200 lines because the init/alloc/release/dispose methods are compact.

### 3. `ParticleSpawner.ts` (~180 lines)
All six `spawn*` methods, each creating `InstancedParticle` objects and writing initial instance colors.

**Contents:**
- `spawnFire(x, y, z, group, intensity)`
- `spawnSmoke(x, y, z, color, group, intensity)`
- `spawnExplosion(x, y, z, group)`
- `spawnSplash(x, y, z, group)`
- `spawnVoxelExplosion(x, y, z, count, group)`
- `spawnFog(x, y, z, group)`

**Dependencies:** Reads from `ParticlePoolManager` (to get pools, allocate slots, access materials for colors). Pushes new particles into the shared particles array. Reads `spawnRateScale` for throttling.

**Rationale:** Spawn methods are the most likely to grow (new particle types for Rogue weapons, new visual effects). Isolating them makes it easy to add new spawn variants without touching pool logic or the update loop.

### 4. `ParticleSystem.ts` (~150 lines, refactored)
Thin coordinator that owns the particles array and delegates to the other three modules.

**Contents:**
- `particles: InstancedParticle[]` — the single shared array
- `emitterManager: EmitterManager` — existing delegation (unchanged)
- `poolManager: ParticlePoolManager` — new delegate
- `spawner: ParticleSpawner` — new delegate
- `spawnRateScale` property
- `initPools(parentGroup)` → delegates to `poolManager`
- `spawnFire/Smoke/Explosion/Splash/VoxelExplosion/Fog` → delegates to `spawner`
- `addEmitter()` / `updateEmittersByIdPrefix()` → delegates to `emitterManager`
- `update()` — the per-frame loop (physics, matrix writes, expiry). This stays here because it touches both the particles array and pool manager intimately.
- `hasActiveParticles()`, `getEmitterStats()`
- `clear()` / `dispose()` → delegates to `poolManager` + `emitterManager`
- Theme subscription in constructor

**Rationale:** `ParticleSystem` keeps its existing public API intact — no callers need to change. It becomes a ~150-line orchestrator. The update loop stays here rather than in a separate file because it's tightly coupled to both the particles array and pool operations, and extracting it would create awkward bidirectional dependencies.

## Dependency Graph

```
ParticleTypes.ts          (no imports from siblings)
       ↑
ParticlePoolManager.ts    (imports ParticleTypes)
       ↑
ParticleSpawner.ts        (imports ParticleTypes, ParticlePoolManager)
       ↑
ParticleSystem.ts         (imports all three + EmitterManager)
```

No circular dependencies. Clean top-down flow.

## Migration Notes

- `ParticleSystem`'s public API is unchanged — all existing callers (`EntityManager`, `ImpactEffects`, `SinkingEffects`, etc.) continue importing from `ParticleSystem.ts`.
- The `EmitterManager.ts` extraction already exists and stays as-is.
- Materials that are currently `public` on `ParticleSystem` (e.g., `fireMat`, `greySmokeMat`, `blackSmokeMat`) move to `ParticlePoolManager` and are re-exported or accessed via `poolManager` from `ParticleSystem`.
- The `EmitterSpawnCallback` interface (in `EmitterManager.ts`) still works — `ParticleSystem` implements it by delegating to `ParticleSpawner`.
