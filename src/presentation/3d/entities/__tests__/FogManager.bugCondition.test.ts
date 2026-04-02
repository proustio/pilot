import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FogManager } from '../FogManager';
import { VesselVisibilityManager } from '../VesselVisibilityManager';
import { Config } from '../../../../infrastructure/config/Config';
import { Ship } from '../../../../domain/fleet/Ship';

// Mock THREE to avoid WebGL dependencies
vi.mock('three', () => {
    class MockGroup {
        add = vi.fn();
        remove = vi.fn();
        children: any[] = [];
        parent = { children: [{ add: vi.fn() }] };
    }
    class MockInstancedMesh {
        material = {
            opacity: 0.85,
            transparent: false,
            clone: vi.fn(() => ({ opacity: 0.85, transparent: true }))
        };
        position = { set: vi.fn() };
        setMatrixAt = vi.fn();
        userData: any = {};
        parent = { remove: vi.fn() };
    }
    return {
        Group: MockGroup,
        Mesh: vi.fn(),
        InstancedMesh: MockInstancedMesh,
        BufferGeometry: vi.fn(),
        Material: vi.fn(),
        Matrix4: vi.fn(),
        MeshStandardMaterial: vi.fn()
    };
});

describe('FogManager Bug Condition: Per-Frame Unconditional Fog Recalculation', () => {
    let fogManager: FogManager;
    let mockGroup: any;
    let playerShip: Ship;

    beforeEach(() => {
        Config.board.width = 20;
        Config.board.height = 20;

        mockGroup = new THREE.Group();
        fogManager = new FogManager(mockGroup, true);

        fogManager.initializeDynamicAssets({} as any, {
            clone: () => ({ opacity: 0.85, transparent: true })
        } as any);

        // Player ship at (10, 10), size 1, visionRadius 5
        playerShip = new Ship('p1', 1);
        playerShip.isEnemy = false;
        playerShip.visionRadius = 5;
        playerShip.placeCoordinate(10, 10, 0 as any); // Horizontal
    });

    /**
     * Bug Condition Property:
     *
     * For any sequence of N consecutive calls to updateRogueFog() with no
     * intervening state changes, the inner loop (cell iteration) should
     * execute at most 1 time (the initial computation). Subsequent calls
     * on a clean state should be skipped entirely.
     *
     * On UNFIXED code: getOccupiedCoordinates() is called N times (once
     * per updateRogueFog call), proving the inner loop runs every frame
     * unconditionally. This test FAILS, confirming the bug exists.
     *
     * Counterexample: "updateRogueFog iterates all 400 cells on every
     * call regardless of state changes — getOccupiedCoordinates is
     * invoked 60 times across 60 identical frames instead of ≤ 1."
     */
    it('should NOT execute inner loop on every frame when no state has changed', () => {
        const spy = vi.spyOn(playerShip, 'getOccupiedCoordinates');

        const N = 60; // Simulate 60 frames (1 second at 60fps)
        for (let i = 0; i < N; i++) {
            fogManager.updateRogueFog([playerShip]);
        }

        // Expected: inner loop runs at most 1 time (first call computes, rest skip)
        // On unfixed code: spy is called 60 times → FAILS
        expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('should skip computation entirely on repeated calls with identical ship positions', () => {
        const spy = vi.spyOn(playerShip, 'getOccupiedCoordinates');

        // First call — expected to compute
        fogManager.updateRogueFog([playerShip]);
        const callsAfterFirst = spy.mock.calls.length;

        // 9 more calls with zero state changes
        for (let i = 0; i < 9; i++) {
            fogManager.updateRogueFog([playerShip]);
        }

        // Expected: no additional inner loop executions after the first
        // On unfixed code: 10 total calls → FAILS
        expect(spy.mock.calls.length).toBe(callsAfterFirst);
    });

    it('should not iterate cells when called via VesselVisibilityManager.update() on clean frames', () => {
        const visManager = new VesselVisibilityManager(fogManager);
        visManager.allShips = [playerShip];

        const spy = vi.spyOn(playerShip, 'getOccupiedCoordinates');

        // First update — fog should compute once
        visManager.update(0);
        const callsAfterFirst = spy.mock.calls.length;

        // 59 more frames with no state changes
        for (let i = 1; i < 60; i++) {
            visManager.update(i / 60);
        }

        // Expected: no additional inner loop executions beyond the first
        // On unfixed code: getOccupiedCoordinates called 60 times → FAILS
        expect(spy.mock.calls.length).toBe(callsAfterFirst);
    });
});
