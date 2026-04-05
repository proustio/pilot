import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FogManager } from '../FogManager';
import { FogVisibility } from '../FogVisibility';
import { Config } from '../../../../infrastructure/config/Config';
import { Ship } from '../../../../domain/fleet/Ship';

// Mock minimal THREE for performance measurement
vi.mock('three', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original as any,
        Group: class {
            add = vi.fn();
            remove = vi.fn();
            children = [];
            parent = { children: [{ add: vi.fn() }] };
        },
        InstancedMesh: class {
            count = 24000;
            instanceMatrix = { needsUpdate: false };
            material = { opacity: 0.85, transparent: true };
            userData = {};
            setMatrixAt = vi.fn();
        }
    };
});

describe('Rogue Mode Performance Benchmarks', () => {
    let fogManager: FogManager;
    let fogVisibility: FogVisibility;

    beforeEach(() => {
        // Force Rogue board dimensions (20x20)
        Config.board.width = 10;
        Config.board.height = 10;
        Config.board.rogueWidth = 20;
        Config.board.rogueHeight = 20;
        Config.rogueMode = true;
        
        const mockGroup = new THREE.Group();
        fogManager = new FogManager(mockGroup, true);
        fogVisibility = new FogVisibility(true);
        
        fogManager.initializeDynamicAssets({} as any, { 
            clone: () => ({ opacity: 0.85, transparent: true }) 
        } as any);
    });

    it('Benchmark: Fog Update Performance (24,000 instances)', () => {
        const ships: Ship[] = [];
        for (let i = 0; i < 20; i++) {
            const ship = new Ship(`ship-${i}`, 3);
            ship.isEnemy = false;
            ship.visionRadius = 7;
            vi.spyOn(ship, 'getOccupiedCoordinates').mockReturnValue([{ x: i, z: i }]);
            ships.push(ship);
        }

        fogManager.markFogDirty();
        
        const start = performance.now();
        fogManager.updateRogueFog(ships);
        const end = performance.now();
        const duration = end - start;

        console.log(`[BENCHMARK] Fog update (24,000 instances) took: ${duration.toFixed(2)}ms`);
        expect(duration).toBeLessThan(10);
    });

    it('Benchmark: Visibility Cache Rebuild Performance (Full Board)', () => {
        const ships: Ship[] = [];
        for (let i = 0; i < 20; i++) {
            const ship = new Ship(`ship-${i}`, 5);
            ship.isEnemy = false;
            ship.visionRadius = 10;
            
            const coords = [];
            for(let len=0; len<5; len++) {
                 coords.push({x: i, z: len});
            }
            vi.spyOn(ship, 'getOccupiedCoordinates').mockReturnValue(coords);
            ships.push(ship);
        }

        const start = performance.now();
        fogVisibility.setLastShipsOnBoard(ships);
        const end = performance.now();
        const duration = end - start;

        console.log(`[BENCHMARK] Visibility cache rebuild took: ${duration.toFixed(2)}ms`);
        expect(duration).toBeLessThan(5);
    });
});
