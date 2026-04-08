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

                    const isBow = xNorm > 0.4 && !isCarrier;

                    if (isEdge || isBowStern) {
                        if (isCarrier) {
                            maxLy = Math.max(maxLy, 2);
                        } else if (!isBow) {
                            // Stern: modest rise for the transom
                            const sternRise = Math.pow(Math.max(0, -xNorm - 0.8) / 0.2, 2) * 1.5;
                            maxLy = Math.max(maxLy, 2 + sternRise);
                        }
                    }

                    // Bow V-shape: applied to ALL voxels in the bow taper zone,
                    // not just edges. Height peaks at centerline, drops at edges.
                    if (isBow) {
                        const distFromCenter = Math.abs(shipWidthPos - center);
                        const edgeFactor = halfWidth > 0.5
                            ? distFromCenter / halfWidth
                            : 1.0;
                        const bowProgress = (xNorm - 0.4) / 0.6;
                        const peakRise = Math.pow(bowProgress, 1.2) * 5;
                        const rise = peakRise * Math.pow(Math.max(0, 1.0 - edgeFactor), 0.6);
                        maxLy = Math.max(maxLy, 2 + rise);
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

        // ───── Stern flag pole and Jolly Roger ─────
        if (!isCarrier) {
            const flagVoxels = ShipVoxelBuilder.buildFlagVoxels(ship, darkAccent);
            voxelsData.push(...flagVoxels);
        }

        return voxelsData;
    }

    /**
     * Computes hull half-width at a normalized length position.
     * Bow (xNorm > 0) tapers to a sharp 1-voxel point for a V shape from above.
     * Stern (xNorm < 0) tapers earlier and rounder.
     */
    public static getHullWidth(xNorm: number, shipSize: number): number {
        const absX = Math.abs(xNorm);
        const isBow = xNorm > 0;
        const isCarrier = shipSize === 5;
        const isBattleship = shipSize === 4;
        const isDestroyer = shipSize === 3;

        let bodyWidth: number;
        let bowStart: number;
        let sternStart: number;
        let sternTip: number;

        if (isCarrier) {
            bodyWidth = 5.0; bowStart = 0.6; sternStart = 0.7; sternTip = 1.5;
        } else if (isBattleship) {
            bodyWidth = 4.0; bowStart = 0.5; sternStart = 0.6; sternTip = 1.0;
        } else if (isDestroyer) {
            bodyWidth = 3.0; bowStart = 0.45; sternStart = 0.5; sternTip = 0.8;
        } else {
            bodyWidth = 2.0; bowStart = 0.4; sternStart = 0.4; sternTip = 0.8;
        }

        if (isBow) {
            if (absX > bowStart) {
                const t = (absX - bowStart) / (1.0 - bowStart);
                return Math.max(0.5, bodyWidth * (1.0 - t));
            }
            return bodyWidth;
        } else {
            if (absX > sternStart) {
                const t = (absX - sternStart) / (1.0 - sternStart);
                return sternTip + (bodyWidth - sternTip) * (1.0 - t);
            }
            return bodyWidth;
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

    /**
     * Generates voxel data for a flag pole and pixel-art Jolly Roger at the stern.
     * The pole rises from the side edge at the middle of the stern section;
     * the flag (skull & crossbones bitmap) extends toward the back of the ship.
     */
    private static buildFlagVoxels(ship: Ship, poleColor: THREE.Color): VoxelData[] {
        const voxels: VoxelData[] = [];
        const voxelSize = 0.1;

        const sternMidLx = Math.round(ship.size * 10 * 0.12);
        const sternHalfWidth = ShipVoxelBuilder.getHullWidth(-0.75, ship.size);
        const poleLz = Math.round(4.5 + sternHalfWidth);

        const poleHeight = Math.min(4 + ship.size, 8);
        const deckTop = 3;

        // Flag pole — vertical column
        for (let ly = deckTop; ly <= deckTop + poleHeight; ly++) {
            voxels.push({
                pos: new THREE.Vector3(
                    sternMidLx * voxelSize - (voxelSize / 2 * 9),
                    ly * voxelSize,
                    poleLz * voxelSize - (voxelSize / 2 * 9)
                ),
                color: poleColor,
                isAccent: false
            });
        }

        // Jolly Roger pixel bitmap (7 wide × 7 tall, row 0 = bottom)
        // 0 = black background, 1 = white skull/bones
        const skull: number[][] = [
            [1, 0, 0, 0, 0, 0, 1], // row 0: crossbone tips
            [0, 1, 0, 0, 0, 1, 0], // row 1: crossbone ends
            [0, 0, 1, 0, 1, 0, 0], // row 2: crossbones X center
            [0, 0, 1, 1, 1, 0, 0], // row 3: jaw
            [0, 1, 0, 1, 0, 1, 0], // row 4: eyes + nose
            [0, 1, 1, 1, 1, 1, 0], // row 5: skull sides
            [0, 0, 1, 1, 1, 0, 0], // row 6: top of skull
        ];

        const flagBlack = new THREE.Color(0x111111);
        const flagWhite = new THREE.Color(0xeeeeee);
        const flagW = skull[0].length;
        const flagH = skull.length;
        const flagBaseY = deckTop + poleHeight - flagH;

        for (let fy = 0; fy < flagH; fy++) {
            for (let fx = 0; fx < flagW; fx++) {
                const pixel = skull[fy][fx];
                voxels.push({
                    pos: new THREE.Vector3(
                        (sternMidLx - fx - 1) * voxelSize - (voxelSize / 2 * 9),
                        (flagBaseY + fy) * voxelSize,
                        poleLz * voxelSize - (voxelSize / 2 * 9)
                    ),
                    color: pixel === 1 ? flagWhite : flagBlack,
                    isAccent: false
                });
            }
        }

        return voxels;
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
