# Graphics Hardening: Particle System Architectural Plan

In accordance with the architectural guidelines from `.kiro/steering/structure.md` and `.kiro/steering/architect.md`, the `ParticleSystem.ts` has grown too large and handles too many distinct responsibilities. While extracting methods internally mitigated visual bloat, it did not solve the architectural coupling and performance traps.

This plan outlines how to aggressively decouple and optimize the `ParticleSystem`, shifting it back to a "thin coordinator" while delegating heavy math and initialization to specialized helpers.

## 1. Data-Driven Physics Behaviors (The `InstancedParticle` interface)
**Current Issue:** `ParticleSystem` hardcodes `if (p.isSmoke)` inside the hot loop, tightly coupling physics logic to the global updater.
**Steering Alignment:** "Primary classes act as thin coordinators; specialized helpers own the logic."
**Action Plan:**
- Remove all domain-specific flags (`isSmoke`, `isFire`) from the update loop.
- Expand the `InstancedParticle` interface to hold pure mathematical deltas: `scaleDelta`, `rotationDelta`, `gravityModifier`, and `colorFadeRate`.
- **Delegation:** The `EmitterManager` (or a new `ParticleFactory`) will be exclusively responsible for assigning these deltas when a particle spawns based on its type.
- **The Result:** The hot loop never branches. It executes universally fast math:
  ```typescript
  p.position.addScaledVector(p.velocity, speed);
  p.scale += p.scaleDelta * speed;
  p.rotation.x += p.rotationDelta * speed;
  p.velocity.y -= p.gravityModifier * speed;
  ```

## 2. Pre-computed Coordinate Space (The Transformation Trap)
**Current Issue:** Translating `localToWorld` and `worldToLocal` for every particle every frame generates immense matrix operations.
**Steering Alignment:** Performance constraints dictate minimizing CPU overhead during the render loop (`requestAnimationFrame`).
**Action Plan:**
- Particles in global/shared pools must *live* completely in the coordinating `poolParent` space.
- Modify `EmitterManager` so that when an event requests a particle spawn (e.g., at a specific ship's local segment), the `EmitterManager` translates that spawn coordinate into the `poolParent` coordinate space ONCE per particle.
- Assign this globally-mapped coordinate to `p.position`.
- **The Result:** We completely delete the `localToWorld` coordinate conversions from the `update()` loop.

## 3. High-Performance Indexing (Memory Cleanup)
**Current Issue:** The loop incurs string-based map lookups (`this.poolManager.pools.get(p.poolType)`) constantly inside a tightly bound array iterator.
**Action Plan:**
- Keep the highly-efficient **Swap-and-Pop** array deletion mechanism.
- Add a direct `poolRef: ParticlePool` property to the `InstancedParticle` definition.
- When `EmitterManager` fetches a slot for a new particle, attach the `ParticlePool` reference directly onto the particle object.
- **The Result:** Direct object-reference access when invoking `this.poolManager.releaseSlot(p.poolRef, p.slotIndex)`. No string hashes, no Map overhead.

## 4. Raw WebGL Render Injection (Avoiding `.compose()`)
**Current Issue:** Instantiating `_tempMatrix.compose()` uses trigonometric operations (sin/cos for Quaternions) for every particle, even those that just travel in straight lines.
**Action Plan:**
- A massive amount of `InstancedMesh` performance can be squeezed by directly mutating the `Float32Array` of the `instanceMatrix`.
- When a particle spawns, immediately compose its initial 16-float matrix and inject it.
- During `update()`, if a particle *only* translates (no continuous rotation), skip `.compose()`. Directly mutate the matrix array elements `[12]`, `[13]`, and `[14]` (X, Y, Z translation) for that `slotIndex`.
- **The Result:** We bypass Three.js's higher-level matrix math abstraction, shifting data directly into the webGL memory structures, significantly reducing time-to-render.

## Next Steps
This sequence ensures `ParticleSystem.ts` reverts to a true "Coordinator", routing arrays and pushing buffers with zero domain logic inside the WebGL loop, directly fulfilling the architecture constraints from the `steering/` manifests. 

If this plan is approved, we can begin implementing Phase 1 (Data-Driven Behaviors) immediately.
