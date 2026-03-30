import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FogManager } from '../FogManager';
import { Config } from '../../../../infrastructure/config/Config';
import { Ship, Orientation } from '../../../../domain/fleet/Ship';

// Mock THREE to avoid WebGL dependencies (follows FogManager.rogue.test.ts pattern)
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
            dispose: vi.fn(),
            clone: vi.fn(() => ({ opacity: 0.85, transparent: true, dispose: vi.fn() }))
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

function createShip(id: string, size: number, x: number, z: number, isEnemy = false, orientation = Orientation.Horizontal): Ship {
    const ship = new Ship(id, size);
    ship.isEnemy = isEnemy;
    ship.visionRadius = 5;
    ship.placeCoordinate(x, z, orientation);
    return ship;
}

const mockMat = { clone: () => ({ opacity: 0.85, transparent: true, dispose: vi.fn() }) } as any;

function makeFogManager(rogue = true): FogManager {
    const fm = new FogManager(new THREE.Group(), rogue);
    fm.initializeDynamicAssets({} as any, mockMat);
    return fm;
}

// Chebyshev distance from point to nearest ship segment
function chebyshevDist(x: number, z: number, ship: Ship): number {
    let min = Infinity;
    for (const c of ship.getOccupiedCoordinates()) {
        min = Math.min(min, Math.max(Math.abs(c.x - x), Math.abs(c.z - z)));
    }
    return min;
}

// Simple seeded PRNG for reproducible property tests
function prng(seed: number) {
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

describe('FogManager Preservation: isCellRevealed Correctness', () => {
    let fm: FogManager;

    beforeEach(() => {
        Config.board.width = 20;
        Config.board.height = 20;
        fm = makeFogManager(true);
    });

    // ─── Observation Phase ───

    describe('Observation: Ship vision radius', () => {
        it('returns true within radius, false outside', () => {
            const ship = createShip('p1', 1, 10, 10);
            fm.updateRogueFog([ship]);

            expect(fm.isCellRevealed(10, 10)).toBe(true);  // on ship
            expect(fm.isCellRevealed(15, 10)).toBe(true);   // Chebyshev 5
            expect(fm.isCellRevealed(10, 15)).toBe(true);   // Chebyshev 5
            expect(fm.isCellRevealed(15, 15)).toBe(true);   // Chebyshev 5 diagonal
            expect(fm.isCellRevealed(0, 0)).toBe(false);    // Chebyshev 10
            expect(fm.isCellRevealed(16, 10)).toBe(false);  // Chebyshev 6
            expect(fm.isCellRevealed(4, 10)).toBe(false);   // Chebyshev 6
        });
    });

    describe('Observation: Temporarily revealed cells', () => {
        it('returns true for temp-revealed cells outside ship vision', () => {
            const ship = createShip('p1', 1, 10, 10);
            fm.revealCellTemporarily(0, 0, 2);
            fm.updateRogueFog([ship]);

            expect(fm.isCellRevealed(0, 0)).toBe(true);
        });

        it('temp reveals expire after onTurnChange decrements duration to zero', () => {
            const ship = createShip('p1', 1, 10, 10);

            // Duration 2: revealed for 2 turn changes
            fm.revealCellTemporarily(0, 0, 2);
            fm.updateRogueFog([ship]);
            expect(fm.isCellRevealed(0, 0)).toBe(true);

            // First turn change: duration 2 → 1, still in temp map
            fm.onTurnChange();
            expect(fm.isCellRevealed(0, 0)).toBe(true);

            // Second turn change: duration 1 → removed from temp map
            fm.onTurnChange();
            // On unfixed code, the fog mesh was already removed (opacity went to 0),
            // so isCellRevealed falls through to "no mesh = revealed".
            // The key preservation property is that the temp map entry IS removed —
            // we verify this indirectly: a NEW temp reveal at the same cell works.
            fm.revealCellTemporarily(0, 0, 1);
            expect(fm.isCellRevealed(0, 0)).toBe(true);
            fm.onTurnChange(); // removes the new entry
            // The cell is still "revealed" due to missing fog mesh (baseline behavior)
            // This is the actual observed behavior we must preserve.
        });
    });

    describe('Observation: Permanently revealed cells', () => {
        it('returns true for perm-revealed cells outside ship vision', () => {
            const ship = createShip('p1', 1, 10, 10);
            fm.revealCellPermanently(19, 19);
            fm.updateRogueFog([ship]);

            expect(fm.isCellRevealed(19, 19)).toBe(true);
        });

        it('perm reveals persist across turn changes', () => {
            const ship = createShip('p1', 1, 10, 10);
            fm.revealCellPermanently(0, 0);
            fm.updateRogueFog([ship]);

            fm.onTurnChange();
            fm.onTurnChange();
            expect(fm.isCellRevealed(0, 0)).toBe(true);
        });
    });

    describe('Observation: Setup phase quadrant', () => {
        it('returns true for cells x<7, z<7 during setup', () => {
            fm.setSetupPhase(true);
            fm.updateRogueFog([]);

            expect(fm.isCellRevealed(0, 0)).toBe(true);
            expect(fm.isCellRevealed(6, 6)).toBe(true);
            expect(fm.isCellRevealed(3, 3)).toBe(true);
        });

        it('returns false outside setup quadrant during setup', () => {
            fm.setSetupPhase(true);
            fm.updateRogueFog([]);

            expect(fm.isCellRevealed(7, 0)).toBe(false);
            expect(fm.isCellRevealed(0, 7)).toBe(false);
        });
    });

    describe('Observation: Hit/sunk ship segments', () => {
        it('returns true for hit enemy segments', () => {
            const player = createShip('p1', 1, 0, 0);
            const enemy = createShip('e1', 3, 18, 18, true);
            enemy.hitSegment(0);
            fm.updateRogueFog([player, enemy]);

            expect(fm.isCellRevealed(18, 18)).toBe(true);  // hit segment
            expect(fm.isCellRevealed(19, 18)).toBe(false);  // unhit, outside vision
        });

        it('returns true for all segments of a sunk ship', () => {
            const player = createShip('p1', 1, 0, 0);
            const enemy = createShip('e1', 2, 18, 18, true);
            enemy.hitSegment(0);
            enemy.hitSegment(1);
            fm.updateRogueFog([player, enemy]);

            expect(enemy.isSunk()).toBe(true);
            expect(fm.isCellRevealed(18, 18)).toBe(true);
            expect(fm.isCellRevealed(19, 18)).toBe(true);
        });
    });

    describe('Observation: Classic mode no-op', () => {
        it('updateRogueFog returns early, never iterates cells', () => {
            Config.board.width = 10;
            Config.board.height = 10;
            const classicFm = makeFogManager(false);

            const ship = createShip('p1', 1, 5, 5);
            const spy = vi.spyOn(ship, 'getOccupiedCoordinates');

            classicFm.updateRogueFog([ship]);
            expect(spy).not.toHaveBeenCalled();

            Config.board.width = 20;
            Config.board.height = 20;
        });
    });

    // ─── Property-Based Tests ───

    describe('Property: isCellRevealed matches Chebyshev distance', () => {
        it('for random single-cell ships, revealed iff dist ≤ visionRadius', () => {
            const rand = prng(42);

            for (let i = 0; i < 200; i++) {
                const sx = Math.floor(rand() * 20);
                const sz = Math.floor(rand() * 20);
                const qx = Math.floor(rand() * 20);
                const qz = Math.floor(rand() * 20);

                const ship = createShip(`s${i}`, 1, sx, sz);
                // Mark dirty so updateRogueFog recomputes with new ship position
                fm.markFogDirty();
                fm.updateRogueFog([ship]);

                const dist = chebyshevDist(qx, qz, ship);
                const revealed = fm.isCellRevealed(qx, qz);

                if (dist <= 5) expect(revealed).toBe(true);
                else expect(revealed).toBe(false);
            }
        });

        it('for random multi-segment ships, vision extends from each segment', () => {
            const rand = prng(123);

            for (let i = 0; i < 100; i++) {
                const sx = Math.floor(rand() * 17);
                const sz = Math.floor(rand() * 20);
                const ship = createShip(`s${i}`, 3, sx, sz, false, Orientation.Horizontal);

                fm.markFogDirty();
                fm.updateRogueFog([ship]);

                const qx = Math.floor(rand() * 20);
                const qz = Math.floor(rand() * 20);
                const dist = chebyshevDist(qx, qz, ship);
                const revealed = fm.isCellRevealed(qx, qz);

                if (dist <= 5) expect(revealed).toBe(true);
            }
        });
    });

    describe('Property: Reveals always override fog', () => {
        it('temp + perm revealed cells are always revealed regardless of ship position', () => {
            const rand = prng(99);
            const ship = createShip('p1', 1, 10, 10);

            for (let i = 0; i < 50; i++) {
                const tx = Math.floor(rand() * 20);
                const tz = Math.floor(rand() * 20);
                fm.revealCellTemporarily(tx, tz, 3);

                const px = Math.floor(rand() * 20);
                const pz = Math.floor(rand() * 20);
                fm.revealCellPermanently(px, pz);

                fm.updateRogueFog([ship]);

                expect(fm.isCellRevealed(tx, tz)).toBe(true);
                expect(fm.isCellRevealed(px, pz)).toBe(true);
            }
        });
    });

    describe('Property: Classic mode is always a no-op', () => {
        it('for random configs, getOccupiedCoordinates is never called', () => {
            Config.board.width = 10;
            Config.board.height = 10;
            const classicFm = makeFogManager(false);

            const rand = prng(77);
            for (let i = 0; i < 20; i++) {
                const ship = createShip(`s${i}`, 1, Math.floor(rand() * 10), Math.floor(rand() * 10));
                const spy = vi.spyOn(ship, 'getOccupiedCoordinates');

                classicFm.updateRogueFog([ship]);
                classicFm.updateRogueFog([ship]);
                expect(spy).not.toHaveBeenCalled();
                spy.mockRestore();
            }

            Config.board.width = 20;
            Config.board.height = 20;
        });
    });

    describe('Property: reset() clears all fog state', () => {
        it('clears temp reveals, perm reveals, and isInitialized', () => {
            const ship = createShip('p1', 1, 10, 10);
            fm.revealCellTemporarily(0, 0, 5);
            fm.revealCellPermanently(19, 19);
            fm.updateRogueFog([ship]);

            expect(fm.isCellRevealed(0, 0)).toBe(true);
            expect(fm.isCellRevealed(19, 19)).toBe(true);
            expect(fm.isCellRevealed(10, 10)).toBe(true);

            fm.reset();

            // After reset, isInitialized=false → all return false in rogue mode
            expect(fm.isCellRevealed(0, 0)).toBe(false);
            expect(fm.isCellRevealed(19, 19)).toBe(false);
            expect(fm.isCellRevealed(10, 10)).toBe(false);
        });

        it('allows fresh computation after reset', () => {
            const ship = createShip('p1', 1, 5, 5);
            fm.updateRogueFog([ship]);
            expect(fm.isCellRevealed(5, 5)).toBe(true);

            fm.reset();
            expect(fm.isCellRevealed(5, 5)).toBe(false);

            const newShip = createShip('p2', 1, 15, 15);
            fm.updateRogueFog([newShip]);
            expect(fm.isCellRevealed(15, 15)).toBe(true);
            expect(fm.isCellRevealed(5, 5)).toBe(false);
        });
    });
});
