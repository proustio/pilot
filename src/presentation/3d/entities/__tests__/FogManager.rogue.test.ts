import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FogManager } from '../FogManager';
import { Config } from '../../../../infrastructure/config/Config';
import { Ship } from '../../../../domain/fleet/Ship';

// Mock THREE to avoid WebGL dependencies
vi.mock('three', () => {
    class MockGroup {
        add = vi.fn();
        remove = vi.fn();
        children = [];
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
        userData = {};
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

describe('FogManager Rogue Mode', () => {
    let fogManager: FogManager;
    let mockGroup: any;

    beforeEach(() => {
        // Reset config to Rogue-standard 20x20
        Config.board.width = 20;
        Config.board.height = 20;
        
        mockGroup = new THREE.Group();
        fogManager = new FogManager(mockGroup, true);
        
        // Supply dummy assets
        fogManager.initializeDynamicAssets({} as any, { 
            clone: () => ({ opacity: 0.85, transparent: true }) 
        } as any);
    });

    it('calculates visibility based on ship proximity', () => {
        // Create a player ship at (10, 10) with vision radius 5
        const playerShip = new Ship('p1', 1);
        playerShip.isEnemy = false;
        playerShip.visionRadius = 5;
        
        // Place the ship correctly so orientation and headX/headZ are set
        playerShip.placeCoordinate(10, 10, 'horizontal' as any);

        // Run update multiple times to let opacity lerp below 0.2
        // lerpFactor is 0.1, target is 0.1, start is 0.85. 
        for (let i = 0; i < 30; i++) {
            fogManager.updateRogueFog([playerShip]);
        }

        // Inside radius (dist <= 5)
        expect(fogManager.isCellRevealed(10, 10)).toBe(true);
        expect(fogManager.isCellRevealed(15, 10)).toBe(true); // Chebyshev dist = 5
        expect(fogManager.isCellRevealed(10, 15)).toBe(true);

        // Outside radius (dist > 5)
        expect(fogManager.isCellRevealed(0, 0)).toBe(false);
        expect(fogManager.isCellRevealed(16, 10)).toBe(false);
    });

    it('reveals entire player quadrant (0-6, 0-6) during setup phase', () => {
        fogManager.setSetupPhase(true);
        
        // No ships yet
        for (let i = 0; i < 30; i++) {
            fogManager.updateRogueFog([]);
        }

        // Corner 1
        expect(fogManager.isCellRevealed(0, 0)).toBe(true);
        // Corner 2
        expect(fogManager.isCellRevealed(6, 6)).toBe(true);

        // Outside quadrant
        expect(fogManager.isCellRevealed(7, 0)).toBe(false);
        expect(fogManager.isCellRevealed(0, 7)).toBe(false);
    });
});
