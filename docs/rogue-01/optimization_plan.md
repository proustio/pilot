# Performance Optimization Proposal

When reviewing the `Geek Stats` in your screenshots alongside the `.kiro/steering/tech.md` requirements, the root cause for the low frame rate (19–22 FPS) is extremely clear:

> **The game is currently pushing over 1,144 draw calls per frame.**

The tech guidelines strictly mandate **"Performance Targets: Keep draw calls < 100 by using InstancedMesh for repeated voxel geometry..."**

By performing a thorough codebase analysis, I've identified all the areas violating this convention. To regain 120+ FPS, we need to collapse these recurring object instantiations into single-draw `InstancedMesh` instances.

Here is the proposed action plan, prioritized by maximum impact:

### Priority 1: The Tactical Grid (800 Draw Calls)
**File:** `BoardBuilder.ts`
Rogue Mode features a 20x20 board. Currently, every single cell creates an individual `THREE.Mesh` for the player side and an individual `THREE.Mesh` for the enemy side.
- **Problem**: $20 \times 20 \times 2 = 800$ individual draw calls for just the invisible/holographic tiles.
- **Solution**: Replace `ptile` and `etile` creation loops with two `THREE.InstancedMesh` objects (one for the player grid, one for the enemy grid). We can still assign `userData` to an invisible logical grid array for Raycasting, decoupled from the visual mesh.

### Priority 2: Rivets and Screws (40 Draw Calls)
**File:** `BoardBuilder.ts`
The decorative industrial elements on the edge of the board are created individually.
- **Problem**: 32 individual rivets and 8 meshes for screws (head + slot).
- **Solution**: Collapse all 32 rivets into a single `InstancedMesh(rivetGeo, rivetMat, 32)`, and similarly for the screws.

### Priority 3: Rogue Move Highlights (Up to 200+ Draw Calls)
**File:** `InputFeedbackHandler.ts`
When an active ship is selected, the `rebuildMoveHighlight()` loops over the board. For every reachable tile, it currently does `new THREE.Mesh(geo, mat)`.
- **Problem**: If a ship has a speed of 10, the diamond-shaped movement radius could spawn well over 100 individual meshes instantly spiking the GPU.
- **Solution**: Replace the `moveHighlightGroup` loop with a single `InstancedMesh` that resizes dynamically based on valid moves.

### Priority 4: Ship Turrets & Extras (36 Draw Calls)
**File:** `ShipFactory.ts`
- **Problem**: The `addTurrets` function creates a `baseMesh` and a `barrelMesh` for every turret individually. With 6 ships sporting up to 3 turrets each, that’s 36 draw calls just for turrets.
- **Solution**: The ship hull is already an efficient `InstancedMesh`. Turrets should be added to their own global `InstancedMesh` (or one per ship). 

---

### Expected Result
If we execute **Priority 1** and **Priority 2**, we will instantly shave off **840 draw calls**. This will reliably drop the active draw call count into the ~100 range and should easily restore the locked 120+ FPS you are aiming for, even with the new voxel tornado physics spinning overhead.

Let me know if you approve this optimization plan, and I will execute the changes in `BoardBuilder.ts` and `InputFeedbackHandler.ts` immediately!
