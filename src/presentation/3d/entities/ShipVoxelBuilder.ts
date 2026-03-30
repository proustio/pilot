import * as THREE from 'three';
import { Ship } from '../../../domain/fleet/Ship';
import { ThemeManager } from '../../theme/ThemeManager';

/** Data for a single voxel in the ship hull. */
export interface VoxelData {
    pos: THREE.Vector3;
    color: THREE.Color;
    isAccent: boolean;
}

/**
 * Generates voxel hull data for ship models — hull shape computation,
 * voxel position generation, and color assignment. Extracted from
 * ShipFactory to separate geometry generation from mesh assembly.
 */
export class ShipVoxelBuilder {

    /**
     * Builds the complete voxel data array for a ship hull, including
     * hull shape, bridge heights, and color assignment per voxel.
     */
    public static buildVoxels(ship: Ship, isPlayer: boolean): VoxelData[] {
        const colors = ShipVoxelBuilder.computeColors(isPlayer);
        const { hullColor, deckColor, bridgeColor, darkAccent, accentColor } = colors;

        const voxelsData: VoxelData[] = [];
        const voxelSize = 0.1;
        const length = ship.size;
        const width = 1;

        const L = ship.size * 10;
        const centerX = L / 2 - 0.5;

        const isCarrier = ship.size === 5;

        for (let lx = 0; lx < length * 10; lx++) {
            for (let lz = 0; lz < width * 10; lz++) {
                const shipLengthPos = lx;
                const shipWidthPos = lz;

                const xNorm = (shipLengthPos - centerX) / (L / 2);
                const halfWidth = ShipVoxelBuilder.getHullWidth(xNorm, ship.size);
                const center = 4.5;
                const minW = center - halfWidth;
                const maxW = center + halfWidth;

                if (shipWidthPos >= Math.floor(minW) && shipWidthPos <= Math.ceil(maxW)) {
                    const isEdge = (shipWidthPos - minW) < 1.0 || (maxW - shipWidthPos) < 1.0;
                    const isBowStern = Math.abs(xNorm) > 0.85;

                    let maxLy = ShipVoxelBuilder.getBridgeHeight(xNorm, isEdge, shipWidthPos, maxW, ship.size);

                    if (isEdge || isBowStern) {
                        const bowRise = isCarrier ? 0 : Math.pow(Math.max(0, Math.abs(xNorm) - 0.7) / 0.3, 2) * 2;
                        maxLy = Math.max(maxLy, 2 + bowRise);
                    }

                    for (let ly = 1; ly <= maxLy; ly++) {
                        const voxel = ShipVoxelBuilder.assignColor(
                            ly, maxLy, isEdge, xNorm, lx, shipWidthPos, center,
                            isCarrier, hullColor, deckColor, bridgeColor, darkAccent, accentColor
                        );

                        voxelsData.push({
                            pos: new THREE.Vector3(
                                lx * voxelSize - (voxelSize / 2 * 9),
                                ly * voxelSize,
                                lz * voxelSize - (voxelSize / 2 * 9)
                            ),
                            color: voxel.color,
                            isAccent: voxel.isAccent
                        });
                    }
                }
            }
        }

        return voxelsData;
    }

    /** Computes hull half-width at a normalized length position. */
    public static getHullWidth(xNorm: number, shipSize: number): number {
        const absX = Math.abs(xNorm);
        const isCarrier = shipSize === 5;
        const isBattleship = shipSize === 4;
        const isDestroyer = shipSize === 3;

        if (isCarrier) {
            if (absX > 0.8) return 2.0 + 3.0 * (1.0 - (absX - 0.8) / 0.2);
            return 5.0;
        } else if (isBattleship) {
            if (absX > 0.7) return 1.5 + 2.5 * (1.0 - (absX - 0.7) / 0.3);
            return 4.0;
        } else if (isDestroyer) {
            if (absX > 0.6) return 1.0 + 2.0 * (1.0 - (absX - 0.6) / 0.4);
            return 3.0;
        } else {
            if (absX > 0.5) return 1.0 + 1.0 * (1.0 - (absX - 0.5) / 0.5);
            return 2.0;
        }
    }

    /** Computes bridge/superstructure height at a normalized length position. */
    public static getBridgeHeight(
        xNorm: number, isEdge: boolean, shipWidthPos: number, maxW: number, shipSize: number
    ): number {
        const absX = Math.abs(xNorm);
        const isCarrier = shipSize === 5;
        const isBattleship = shipSize === 4;
        const isDestroyer = shipSize === 3;

        if (isCarrier) {
            const isIslandSide = (maxW - shipWidthPos) <= 2.0;
            if (absX < 0.2 && isIslandSide && !isEdge) return 4;
            return 1;
        } else if (isBattleship) {
            if (absX < 0.15 && !isEdge) return 5;
            if (absX < 0.3 && !isEdge) return 3;
            return 1;
        } else if (isDestroyer) {
            if (xNorm > -0.2 && xNorm < 0.1 && !isEdge) return 3;
            return 1;
        } else {
            if (xNorm > 0.0 && xNorm < 0.4 && !isEdge) return 2;
            return 1;
        }
    }

    /** Resolves base hull/deck/bridge/accent colors based on player side. */
    private static computeColors(isPlayer: boolean) {
        let hullColor = new THREE.Color(0x111111);
        let deckColor = new THREE.Color(0x222222);
        let bridgeColor = new THREE.Color(0x1a1a1a);
        let darkAccent = new THREE.Color(0x050505);

        if (!isPlayer) {
            const invert = (c: THREE.Color) => new THREE.Color(1 - c.r, 1 - c.g, 1 - c.b);
            hullColor = invert(hullColor);
            deckColor = invert(deckColor);
            bridgeColor = invert(bridgeColor);
            darkAccent = invert(darkAccent);
        }

        const tm = ThemeManager.getInstance();
        const accentColor = isPlayer ? tm.getPlayerShipColor() : tm.getEnemyShipColor();

        return { hullColor, deckColor, bridgeColor, darkAccent, accentColor };
    }

    /** Assigns color and accent flag for a single voxel based on position. */
    private static assignColor(
        ly: number, maxLy: number, isEdge: boolean, xNorm: number, lx: number,
        shipWidthPos: number, center: number, isCarrier: boolean,
        hullColor: THREE.Color, deckColor: THREE.Color, bridgeColor: THREE.Color,
        darkAccent: THREE.Color, accentColor: THREE.Color
    ): { color: THREE.Color; isAccent: boolean } {
        let color = hullColor;
        let isAccent = false;
        const isFront = xNorm > 0.8;

        if (ly === maxLy && !isEdge) {
            color = deckColor;
            if (isCarrier && !isEdge && shipWidthPos === Math.floor(center)) {
                color = darkAccent;
            }
            if (isFront) {
                color = accentColor;
                isAccent = true;
            }
        } else if (isEdge && ly > 1) {
            color = accentColor;
            isAccent = true;
        } else if (ly > 2 && !isEdge) {
            color = bridgeColor;
            if (ly === maxLy && (lx % 2 === 0)) color = darkAccent;
        }

        return { color, isAccent };
    }
}
