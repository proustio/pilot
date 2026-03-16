import { describe, it, expect } from 'vitest';
import { Ship, Orientation } from './Ship';

describe('Ship', () => {
    it('should initialize correctly', () => {
        const ship = new Ship('test-ship', 3);
        expect(ship.id).toBe('test-ship');
        expect(ship.size).toBe(3);
        expect(ship.segments).toEqual([true, true, true]);
        expect(ship.isPlaced).toBe(false);
    });

    describe('hitSegment', () => {
        it('should return true and mark segment as hit when hitting a healthy segment', () => {
            const ship = new Ship('ship1', 3);
            const result = ship.hitSegment(1);
            expect(result).toBe(true);
            expect(ship.segments[1]).toBe(false);
            expect(ship.segments).toEqual([true, false, true]);
        });

        it('should return false when hitting an already hit segment', () => {
            const ship = new Ship('ship1', 3);
            ship.hitSegment(1);
            const result = ship.hitSegment(1);
            expect(result).toBe(false);
            expect(ship.segments[1]).toBe(false);
        });

        it('should return false for out of bounds indices', () => {
            const ship = new Ship('ship1', 3);
            expect(ship.hitSegment(-1)).toBe(false);
            expect(ship.hitSegment(3)).toBe(false);
            expect(ship.segments).toEqual([true, true, true]);
        });
    });

    describe('isSunk', () => {
        it('should return false for a new ship', () => {
            const ship = new Ship('ship1', 2);
            expect(ship.isSunk()).toBe(false);
        });

        it('should return false when only some segments are hit', () => {
            const ship = new Ship('ship1', 2);
            ship.hitSegment(0);
            expect(ship.isSunk()).toBe(false);
        });

        it('should return true when all segments are hit', () => {
            const ship = new Ship('ship1', 2);
            ship.hitSegment(0);
            ship.hitSegment(1);
            expect(ship.isSunk()).toBe(true);
        });
    });

    describe('getOccupiedCoordinates', () => {
        it('should return empty array if not placed', () => {
            const ship = new Ship('ship1', 3);
            expect(ship.getOccupiedCoordinates()).toEqual([]);
        });

        it('should return correct coordinates for horizontal placement', () => {
            const ship = new Ship('ship1', 3);
            ship.placeCoordinate(1, 1, Orientation.Horizontal);
            expect(ship.getOccupiedCoordinates()).toEqual([
                { x: 1, z: 1 },
                { x: 2, z: 1 },
                { x: 3, z: 1 }
            ]);
        });

        it('should return correct coordinates for vertical placement', () => {
            const ship = new Ship('ship1', 2);
            ship.placeCoordinate(5, 5, Orientation.Vertical);
            expect(ship.getOccupiedCoordinates()).toEqual([
                { x: 5, z: 5 },
                { x: 5, z: 6 }
            ]);
        });
    });
});
