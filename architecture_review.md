# Architectural Review: Performance Optimization for Voxel Battleships

As we prepare to package the game for Electron and aim to uncap the frame rate, we need to transition our architecture from "functionally correct" to "mechanically sympathetic." The current implementation, while logically sound, performs heavy calculations on the main thread during hot paths (like the render loop and raycasting).

This document contrasts our current approach with industry best practices and provides a concrete roadmap to squeeze absolute maximum performance out of the game, specifically focusing on the visibility/fog system and CPU offloading.

---

## 1. The Fog Bottleneck: Transitioning to O(1) Lookups

### The Current Approach
Currently, `FogVisibility.ts` and `FogManager.ts` calculate cell visibility on-the-fly. Every time the engine needs to know if a cell is revealed (which happens constantly during rendering, instanced mesh updates, and raycasting), the `isCellRevealed` and `computeCellOpacity` methods iterate over:
1. Every player ship on the board.
2. Every cell that ship occupies.
3. Calculates the Manhattan distance to the target cell to check against the vision radius.

**Why this is bad:** This is an $O(S \times C)$ operation (Ships $\times$ Cells per ship) executed *per cell, per frame* in the worst-case scenarios. For a 20x20 board in Rogue mode, this causes massive CPU thrashing and garbage collection pressure, severely capping our FPS.

### The Best Practice: Spatial Hashing & Event-Driven Caching
In game development, visibility and collision checks are almost never computed dynamically in the render loop. They are pre-calculated into memory structures that allow for $O(1)$ lookups.

#### Suggestion: The `Uint8Array` Visibility Map
We need to replace the on-the-fly calculation with a flat `Uint8Array` cache.

1. **Allocate Memory Once:** Create a `Uint8Array(400)` (for a 20x20 board).
2. **O(1) Lookups:** `isCellRevealed(x, z)` simply becomes `return this.visibilityCache[z * boardWidth + x] === 1;`.
3. **Event-Driven Updates:** The cache is *only* recalculated when the game state changes (e.g., `ROGUE_MOVE_SHIP`, `SHIP_DESTROYED`).

```typescript
// Proposed FogVisibility.ts approach
class FogVisibility {
    private visibilityCache: Uint8Array;
    private boardWidth: number;

    constructor(boardWidth: number) {
        this.boardWidth = boardWidth;
        // Allocate once
        this.visibilityCache = new Uint8Array(boardWidth * boardWidth);
    }

    // Hot path: O(1) execution time
    public isCellRevealed(x: number, z: number): boolean {
        return this.visibilityCache[z * this.boardWidth + x] === 1;
    }

    // Called ONLY when a ship moves, dies, or a sonar is dropped
    public rebuildCache(playerShips: Ship[]): void {
        this.visibilityCache.fill(0); // Fast memory reset

        for (const ship of playerShips) {
            // "Paint" the revealed cells onto the Uint8Array
            const coords = ship.getOccupiedCoordinates();
            for (const c of coords) {
                this.paintVisionRadius(c.x, c.z, ship.visionRadius);
            }
        }
        // Apply temporary/permanent reveals over the top
    }
}
```

---

## 2. Unblocking the Main Thread: Web Workers

### The Current Approach
The main thread in a browser (or Electron wrapper) handles rendering (Three.js), DOM updates (UI layer), and JavaScript execution. Currently, heavy domain logic (like AI Monte Carlo heatmap generation in `AITargeting.ts` and potentially the fog reconstruction) runs on this same thread.

**Why this is bad:** Even a calculation that takes 10ms will cause a frame drop if we are targeting 120+ FPS (where you only have ~8.3ms per frame budget).

### The Best Practice: Multithreading via Web Workers
To uncap the FPS, the render loop (`requestAnimationFrame`) must be entirely decoupled from game simulation.

#### Suggestion: Offload AI and Heavy Math
We should move the Hard AI logic (`AITargeting.ts`) and any complex pathfinding into a Web Worker.

1. **Vite Worker Support:** Vite makes this incredibly easy. You can import a worker using `?worker`.
2. **Message Passing:** Pass the serialized board state (or `SharedArrayBuffer` for zero-copy transfers) to the worker, let it crunch the Monte Carlo simulation, and post the result back.

```typescript
// src/application/ai/AIEngine.ts (Main Thread)
import AIWorker from './ai.worker.ts?worker';

export class AIEngine {
    private worker = new AIWorker();

    public calculateMove(boardState: Uint8Array): Promise<Move> {
        return new Promise((resolve) => {
            this.worker.onmessage = (e) => resolve(e.data);
            // Transfer state to worker without blocking the UI
            this.worker.postMessage({ state: boardState });
        });
    }
}
```

---

## 3. Graphics & Draw Call Architecture

### The Current Approach
The current codebase correctly utilizes `InstancedMesh` for ships and fog (as seen in `TurretInstanceManager` and `FogManager`), which is excellent. However, iterating through Three.js scene graphs (e.g., `group.children.forEach`) during the `update()` loop (seen in `EntityManager.ts`) introduces overhead.

### The Best Practice: Data-Oriented Design (DOD)
Instead of iterating through heavy `THREE.Object3D` hierarchies to update states, maintain flat, contiguous arrays of data that map directly to the instances.

#### Suggestion: Flat Transform Arrays
In `EntityManager.ts`, avoid loops like:
```typescript
[this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
    group.children.forEach((child: THREE.Object3D) => {
        // Checking userData and updating transforms
    });
});
```

Instead, maintain a flat array of active, moving entities. When an entity finishes its animation, swap-and-pop it out of the active array.

1. **Decouple Logic from Scene Graph:** The scene graph should only be used for rendering.
2. **Animation Pools:** Keep an array of `ActiveAnimations[]`. During the `update(dt)` loop, only iterate over things that are currently moving.

---

## Conclusion & Next Steps

If we implement these three architectural shifts, we will essentially eliminate CPU bottlenecks:

1. **O(1) Visibility:** Replace all `isCellRevealed` calculations with a pre-calculated `Uint8Array` cache that only updates on game events.
2. **Web Workers:** Offload the Hard AI Monte Carlo simulations and pathfinding to a background thread to guarantee 0 dropped frames during AI turns.
3. **Data-Oriented Updates:** Stop iterating the Three.js scene graph during the `update` loop. Keep flat arrays of actively animating objects.

These changes are highly mechanical, require very little alteration to the user experience, and will allow the Electron app to push hundreds of frames per second on modern hardware.