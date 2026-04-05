import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { FogManager } from '../FogManager';
import { ShipFactory } from '../ShipFactory';
import { Config } from '../../../../infrastructure/config/Config';
import { Ship, Orientation } from '../../../../domain/fleet/Ship';

// ─── Track all InstancedMesh and material clone() calls ───

const createdInstancedMeshes: any[] = [];
let materialCloneCount = 0;

vi.mock('three', () => {
    class MockVector3 {
        x = 0; y = 0; z = 0;
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }

    class MockColor {
        r = 0; g = 0; b = 0;
        constructor(c?: any) {
            if (typeof c === 'number') { this.r = ((c >> 16) & 0xff) / 255; this.g = ((c >> 8) & 0xff) / 255; this.b = (c & 0xff) / 255; }
        }
        copy() { return this; }
    }

    class MockEuler {
        x = 0; y = 0; z = 0;
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    }

    class MockMatrix4 { }

    class MockBufferGeometry { }

    class MockBoxGeometry { }

    class MockSphereGeometry { }

    class MockCylinderGeometry { }

    class MockMesh {
        position = new MockVector3();
        rotation = { x: 0, y: 0, z: 0 };
        userData: any = {};
        castShadow = false;
    }

    class MockObject3D {
        position = new MockVector3();
        rotation = { x: 0, y: 0, z: 0 };
        scale = { x: 1, y: 1, z: 1, set: vi.fn(), setScalar: vi.fn() };
        matrix = {};
        updateMatrix = vi.fn();
    }

    class MockGroup {
        children: any[] = [];
        position = new MockVector3();
        rotation = { x: 0, y: 0, z: 0 };
        userData: any = {};
        visible = true;
        parent: any = null;
        matrix = {};
        updateMatrix = vi.fn();
        add(child: any) {
            child.parent = this;
            this.children.push(child);
        }
        remove(child: any) {
            const idx = this.children.indexOf(child);
            if (idx >= 0) this.children.splice(idx, 1);
        }
    }

    class MockInstancedMesh {
        count: number;
        material: any;
        geometry: any;
        position = new MockVector3();
        userData: any = {};
        parent: any = null;
        castShadow = false;
        receiveShadow = false;
        instanceColor: any = { needsUpdate: false };
        instanceMatrix = { needsUpdate: false };

        constructor(geo: any, mat: any, count: number) {
            this.geometry = geo;
            this.material = mat;
            this.count = count;
            createdInstancedMeshes.push(this);
        }

        setMatrixAt() { }
        setColorAt() { }
        dispose() { }
    }

    const makeMockMaterial = (): any => ({
        opacity: 0.85,
        transparent: false,
        dispose() { },
        userData: {},
        onBeforeCompile: null as any,
        color: new MockColor(),
        clone() {
            materialCloneCount++;
            return makeMockMaterial();
        }
    });

    class MockMeshStandardMaterial {
        opacity = 0.85;
        transparent = false;
        userData: any = {};
        onBeforeCompile: any = null;
        color = new MockColor();
        roughness = 0.5;
        metalness = 0.5;
        constructor(_opts?: any) { }
        dispose() { }
        clone() {
            materialCloneCount++;
            return makeMockMaterial();
        }
    }

    class MockMeshBasicMaterial {
        opacity = 0.2;
        transparent = true;
        wireframe = false;
        color = new MockColor();
        constructor(_opts?: any) { }
        dispose() { }
        clone() {
            materialCloneCount++;
            return makeMockMaterial();
        }
    }

    return {
        Group: MockGroup,
        Mesh: MockMesh,
        InstancedMesh: MockInstancedMesh,
        BufferGeometry: MockBufferGeometry,
        BoxGeometry: MockBoxGeometry,
        SphereGeometry: MockSphereGeometry,
        CylinderGeometry: MockCylinderGeometry,
        Material: class { },
        Matrix4: MockMatrix4,
        MeshStandardMaterial: MockMeshStandardMaterial,
        MeshBasicMaterial: MockMeshBasicMaterial,
        Object3D: MockObject3D,
        Vector3: MockVector3,
        Euler: MockEuler,
        Color: MockColor
    };
});


// Mock ThemeManager (needed by ShipFactory)
vi.mock('../../../theme/ThemeManager', () => ({
    ThemeManager: {
        getInstance: () => ({
            getPlayerShipColor: () => new THREE.Color(0x50C878),
            getEnemyShipColor: () => new THREE.Color(0x8D2B00)
        })
    }
}));

// Mock GameEventBus (needed by ShipFactory)
vi.mock('../../../../application/events/GameEventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn() },
    GameEventType: { THEME_CHANGED: 'THEME_CHANGED' }
}));

function createShip(id: string, size: number, x: number, z: number, isEnemy = false): Ship {
    const ship = new Ship(id, size);
    ship.isEnemy = isEnemy;
    ship.visionRadius = 5;
    ship.placeCoordinate(x, z, Orientation.Horizontal);
    return ship;
}

describe('Phase 2 Bug Condition: Per-Cell InstancedMesh Architecture and Wireframe Overlay', () => {
    const originalBoardWidth = Config.board.width;
    const originalBoardHeight = Config.board.height;
    const originalRogueMode = Config.rogueMode;

    beforeEach(() => {
        Config.board.width = 20;
        Config.board.height = 20;
        Config.rogueMode = true;
        createdInstancedMeshes.length = 0;
        materialCloneCount = 0;
    });

    afterEach(() => {
        Config.board.width = originalBoardWidth;
        Config.board.height = originalBoardHeight;
        Config.rogueMode = originalRogueMode;
    });

    /**
     * Bug Condition Property 3, Test 1 — InstancedMesh Count
     *
     * On unfixed code, updateRogueFog() creates a separate InstancedMesh per
     * fogged cell. With a player ship at (10,10) revealing ~121 cells (11×11
     * Chebyshev square), ~279 cells remain fogged, each getting its own
     * InstancedMesh. The assertion of ≤ 2 will FAIL, confirming the per-cell
     * architecture bottleneck.
     *
     * Counterexample: "~150+ separate InstancedMesh objects created for fog,
     * one per fogged cell, instead of a single consolidated mesh."
     */
    it('should use at most 2 InstancedMesh objects for all Rogue fog (not one per cell)', () => {
        const mockGroup = new THREE.Group();
        // Set up parent structure matching what updateRogueFog expects:
        // enemyBoardGroup.parent.children[0] is the playerBoardGroup
        const parentGroup = new THREE.Group();
        const playerBoardGroup = new THREE.Group();
        parentGroup.add(playerBoardGroup);
        parentGroup.add(mockGroup);

        const fogManager = new FogManager(mockGroup, true);
        const mockMat = {
            opacity: 0.85,
            transparent: false,
            dispose: vi.fn(),
            userData: {},
            onBeforeCompile: null as any,
            clone: vi.fn(() => {
                materialCloneCount++;
                return {
                    opacity: 0.85,
                    transparent: true,
                    dispose: vi.fn(),
                    userData: {},
                    onBeforeCompile: null as any,
                    clone: vi.fn()
                };
            })
        } as any;
        fogManager.initializeDynamicAssets({} as any, mockMat);

        // Player ship at (10,10) with visionRadius=5 reveals an 11×11 area
        // Remaining ~279 cells are fogged → each gets its own InstancedMesh on unfixed code
        const playerShip = createShip('p1', 1, 10, 10);

        // Clear tracking before the call we're measuring
        createdInstancedMeshes.length = 0;

        fogManager.updateRogueFog([playerShip]);

        // Count fog InstancedMesh objects (those with isFog userData)
        const fogMeshes = createdInstancedMeshes.filter(m => m.userData?.isFog);

        // Expected after fix: ≤ 2 (1 consolidated mesh, or 2 for front/back)
        // On unfixed code: ~279 fog meshes → FAILS
        expect(fogMeshes.length).toBeLessThanOrEqual(2);
    });

    /**
     * Bug Condition Property 3, Test 2 — Material Clone Count
     *
     * On unfixed code, each fogged cell clones fogMatProto, creating ~279
     * unique material instances. GPU cannot batch draw calls across different
     * material instances. The assertion of ≤ 1 will FAIL.
     *
     * Counterexample: "~150+ cloned material instances preventing GPU batching,
     * instead of 1 shared material for all fog."
     */
    it('should use at most 1 shared fog material (not clone per cell)', () => {
        const mockGroup = new THREE.Group();
        const parentGroup = new THREE.Group();
        const playerBoardGroup = new THREE.Group();
        parentGroup.add(playerBoardGroup);
        parentGroup.add(mockGroup);

        const fogManager = new FogManager(mockGroup, true);
        materialCloneCount = 0;

        const mockMat = {
            opacity: 0.85,
            transparent: false,
            dispose: vi.fn(),
            userData: {},
            onBeforeCompile: null as any,
            clone: vi.fn(() => {
                materialCloneCount++;
                return {
                    opacity: 0.85,
                    transparent: true,
                    dispose: vi.fn(),
                    userData: {},
                    onBeforeCompile: null as any,
                    clone: vi.fn()
                };
            })
        } as any;
        fogManager.initializeDynamicAssets({} as any, mockMat);

        const playerShip = createShip('p1', 1, 10, 10);
        materialCloneCount = 0;

        fogManager.updateRogueFog([playerShip]);

        // Expected after fix: 0 clones (use fogMatProto directly)
        // On unfixed code: ~279 clones → FAILS
        expect(materialCloneCount).toBeLessThanOrEqual(1);
    });

    /**
     * Bug Condition Property 3, Test 3 — Total Voxel Instance Count
     *
     * On unfixed code, each fogged cell creates an InstancedMesh with 250
     * voxels. With ~279 fogged cells: 279 × 250 = ~69,750 voxel instances.
     * At 12 triangles each, that's ~837K triangles from fog alone.
     * The assertion of ≤ 15,000 will FAIL.
     *
     * Counterexample: "~69,750 fog voxel instances (250 per cell × ~279 cells)
     * producing ~837K triangles, instead of ≤ 15,000 instances with reduced
     * voxel density."
     */
    it('should produce at most 15,000 total fog voxel instances (not 250 per cell)', () => {
        const mockGroup = new THREE.Group();
        const parentGroup = new THREE.Group();
        const playerBoardGroup = new THREE.Group();
        parentGroup.add(playerBoardGroup);
        parentGroup.add(mockGroup);

        const fogManager = new FogManager(mockGroup, true);
        const mockMat = {
            opacity: 0.85,
            transparent: false,
            dispose: vi.fn(),
            userData: {},
            onBeforeCompile: null as any,
            clone: vi.fn(() => {
                materialCloneCount++;
                return {
                    opacity: 0.85,
                    transparent: true,
                    dispose: vi.fn(),
                    userData: {},
                    onBeforeCompile: null as any,
                    clone: vi.fn()
                };
            })
        } as any;
        fogManager.initializeDynamicAssets({} as any, mockMat);

        const playerShip = createShip('p1', 1, 10, 10);
        createdInstancedMeshes.length = 0;

        fogManager.updateRogueFog([playerShip]);

        // Sum up voxel counts across all fog InstancedMesh objects
        const fogMeshes = createdInstancedMeshes.filter(m => m.userData?.isFog);
        const totalVoxels = fogMeshes.reduce((sum: number, m: any) => sum + m.count, 0);

        // Expected after fix: ≤ 15,000 (e.g. ~279 cells × 60 voxels = ~16,740, or fewer with consolidation)
        // On unfixed code: ~279 × 250 = ~69,750 → FAILS
        expect(totalVoxels).toBeLessThanOrEqual(15000);
    });

    /**
     * Bug Condition Property 3, Test 4 — Ship Wireframe Overlay
     *
     * On unfixed code, ShipFactory.createShip() creates 2 InstancedMesh
     * children per ship: the hull mesh and a wireframe overlay (instancedLines).
     * This doubles draw calls per ship. The assertion of ≤ 1 will FAIL.
     *
     * Counterexample: "2 InstancedMesh objects per ship (hull + wireframe),
     * doubling draw calls, instead of 1 hull-only InstancedMesh."
     */
    it('should create at most 1 InstancedMesh per ship (no wireframe overlay)', () => {
        const targetGroup = new THREE.Group();
        const ship = new Ship('test-ship', 3);
        ship.placeCoordinate(5, 5, Orientation.Horizontal);

        createdInstancedMeshes.length = 0;

        // Mock a TurretInstanceManager
        const mockTurretManager = {
            addTurrets: vi.fn(),
            removeTurrets: vi.fn(),
            updateTransform: vi.fn(),
            dispose: vi.fn()
        } as any;

        ShipFactory.createShip(ship, 5, 5, Orientation.Horizontal, true, targetGroup, mockTurretManager);

        // Find the ship group that was added to targetGroup
        const shipGroup = (targetGroup as any).children.find(
            (c: any) => c.userData?.isShip
        );
        expect(shipGroup).toBeDefined();

        // Count InstancedMesh children in the ship group
        const instancedMeshChildren = shipGroup.children.filter(
            (c: any) => createdInstancedMeshes.includes(c)
        );

        // Expected after fix: 1 (hull only)
        // On unfixed code: 2 (hull + wireframe) → FAILS
        expect(instancedMeshChildren.length).toBeLessThanOrEqual(1);
    });
});
