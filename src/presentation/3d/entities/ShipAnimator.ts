import * as THREE from 'three';
import { Orientation } from '../../../domain/fleet/Ship';
import { Config } from '../../../infrastructure/config/Config';
import type { PathCell } from '../../../domain/board/PathResolver';

/** Per-ship state for multi-waypoint path animation */
interface PathAnimationState {
    /** World-space waypoints (converted from grid cells) */
    waypoints: THREE.Vector3[];
    /** Index of the waypoint we're currently moving toward */
    currentSegment: number;
    /** Elapsed time in ms since animation started */
    elapsedMs: number;
    /** Total animation duration in ms */
    totalDurationMs: number;
    /** Duration per segment in ms */
    segmentDurationMs: number;
    /** Starting rotation.y */
    startRotationY: number;
    /** Target rotation.y */
    targetRotationY: number;
    /** Whether rotation needs blending */
    hasRotation: boolean;
}

/**
 * Handles ship animation logic extracted from EntityManager:
 * - Sinking descent animation (with break-apart for broken ships)
 * - Movement lerp (smooth position transitions)
 * - Multi-waypoint path animation (Rogue mode per-cell movement)
 * - Active ship highlight pulsing (Rogue mode)
 * - Placement zone highlight (Rogue setup phase)
 */
export class ShipAnimator {
    private playerBoardGroup: THREE.Group;
    private enemyBoardGroup: THREE.Group;

    private placementHighlightMesh?: THREE.Mesh;

    constructor(playerBoardGroup: THREE.Group, enemyBoardGroup: THREE.Group) {
        this.playerBoardGroup = playerBoardGroup;
        this.enemyBoardGroup = enemyBoardGroup;
    }

    /**
     * Returns true if any ship has an active path animation.
     * Used by EntityManager.isBusy() to block turn progression during movement.
     */
    public hasActivePathAnimation(): boolean {
        for (const group of [this.playerBoardGroup, this.enemyBoardGroup]) {
            for (const child of group.children) {
                if (child.userData.isShip && child.userData.pathAnimation) return true;
            }
        }
        return false;
    }

    /**
     * Finds a ship mesh group by ship ID across both board groups.
     */
    public findShipGroup(shipId: string): THREE.Group | null {
        for (const boardGroup of [this.playerBoardGroup, this.enemyBoardGroup]) {
            for (const child of boardGroup.children) {
                if (child.userData.isShip && child.userData.ship?.id === shipId) {
                    return child as THREE.Group;
                }
            }
        }
        return null;
    }

    /** Timestamp of the last update call for delta-time calculation */
    private lastUpdateTime: number = 0;

    /**
     * Maps an Orientation enum to the Three.js rotation.y value used by ShipFactory.
     */
    public static orientationToRotationY(orientation: Orientation): number {
        switch (orientation) {
            case Orientation.Horizontal: return 0;
            case Orientation.Vertical: return -Math.PI / 2;
            case Orientation.Left: return Math.PI;
            case Orientation.Up: return Math.PI / 2;
        }
    }

    /**
     * Starts a multi-waypoint path animation on a ship mesh.
     * Divides total duration evenly across path cells so all moves take the same time.
     * No-op for zero-length paths.
     */
    public animateAlongPath(
        shipGroup: THREE.Group,
        path: PathCell[],
        finalOrientation: Orientation,
        durationMs: number
    ): void {
        if (path.length === 0) return;

        const boardOffset = Config.board.width / 2;
        const waypoints = path.map(cell =>
            new THREE.Vector3(cell.x - boardOffset + 0.5, 0, cell.z - boardOffset + 0.5)
        );

        const startRotY = shipGroup.rotation.y;
        const targetRotY = ShipAnimator.orientationToRotationY(finalOrientation);
        const hasRotation = Math.abs(this.shortestAngleDist(startRotY, targetRotY)) > 0.001;

        // Clear any existing single-target lerp so they don't conflict
        shipGroup.userData.targetPosition = null;

        shipGroup.userData.pathAnimation = {
            waypoints,
            currentSegment: 0,
            elapsedMs: 0,
            totalDurationMs: durationMs,
            segmentDurationMs: durationMs / waypoints.length,
            startRotationY: startRotY,
            targetRotationY: targetRotY,
            hasRotation,
        } as PathAnimationState;
    }

    /**
     * Returns the shortest signed angular distance from angle a to angle b (radians).
     */
    private shortestAngleDist(a: number, b: number): number {
        let diff = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        return diff;
    }

    /**
     * Runs all ship animation updates for the current frame.
     */
    public update(time: number, activeRogueShipId: string | null, isPlayerTurn: boolean, isSetupPhase: boolean): void {
        this.updateShipAnimations(time);
        this.updateShipHighlighting(time, activeRogueShipId, isPlayerTurn);
        this.updatePlacementHighlight(time, isSetupPhase);
    }

    /**
     * Animates ship sinking descent, single-target movement lerp, and
     * multi-waypoint path animations for all ships on both boards.
     */
    private updateShipAnimations(time: number): void {
        const descentRate = 0.001 * Config.timing.gameSpeedMultiplier;
        const sinkFloor = Config.visual.sinkingFloor;
        const moveLerpFactor = 0.1 * Config.timing.gameSpeedMultiplier;

        // Compute delta time in ms (~16ms per frame at 60fps)
        const dtMs = this.lastUpdateTime > 0
            ? Math.min((time - this.lastUpdateTime) * 1000, 50) // cap at 50ms to avoid jumps
            : 16;
        this.lastUpdateTime = time;

        [this.playerBoardGroup, this.enemyBoardGroup].forEach(group => {
            group.children.forEach((child: THREE.Object3D) => {
                if (!child.userData.isShip) return;

                // Sync sinking state from domain
                if (child.userData.ship.isSunk() && !child.userData.isSinking) {
                    child.userData.isSinking = true;
                    child.userData.sinkAngleZ = (Math.random() - 0.5) * 0.3;
                    child.userData.sinkAngleX = (Math.random() - 0.5) * 0.3;
                }

                if (child.userData.isSinking) {
                    // Rule: Mines disappear immediately, ships/sonars sink
                    if (child.userData.ship.specialType === 'mine') {
                        group.remove(child);
                        return;
                    }

                    if (child.position.y > sinkFloor) {
                        child.position.y -= descentRate;
                        const sinkProgress = Math.min(1.0, -child.position.y / Math.abs(sinkFloor));
                        child.rotation.z = sinkProgress * (child.userData.sinkAngleZ ?? 0.15);
                        child.rotation.x = sinkProgress * (child.userData.sinkAngleX ?? 0.08);

                        if (child.userData.isBroken && child.userData.halfA && child.userData.halfB) {
                            const breakAngle = sinkProgress * 0.4;
                            if (child.userData.shipOrientation === Orientation.Horizontal) {
                                child.userData.halfA.rotation.z = breakAngle;
                                child.userData.halfB.rotation.z = -breakAngle;
                            } else {
                                child.userData.halfA.rotation.x = -breakAngle;
                                child.userData.halfB.rotation.x = breakAngle;
                            }
                        }
                    }
                }

                // Multi-waypoint path animation (takes priority over single-target lerp)
                const anim = child.userData.pathAnimation as PathAnimationState | undefined;
                if (anim) {
                    this.updatePathAnimation(child, anim, dtMs);
                    return; // skip single-target lerp while path animation is active
                }

                if (child.userData.targetPosition) {
                    child.position.lerp(child.userData.targetPosition, moveLerpFactor);
                    if (child.position.distanceToSquared(child.userData.targetPosition) < 0.001) {
                        child.position.copy(child.userData.targetPosition);
                        child.userData.targetPosition = null;
                    }
                }
            });
        });
    }

    /**
     * Advances a multi-waypoint path animation by dtMs milliseconds.
     * Lerps position through waypoints with fixed total duration.
     * Slerps rotation over the entire animation duration.
     */
    private updatePathAnimation(child: THREE.Object3D, anim: PathAnimationState, dtMs: number): void {
        anim.elapsedMs += dtMs * Config.timing.gameSpeedMultiplier;

        const totalProgress = Math.min(anim.elapsedMs / anim.totalDurationMs, 1);

        // Rotation blending over the full duration
        if (anim.hasRotation) {
            const angleDist = this.shortestAngleDist(anim.startRotationY, anim.targetRotationY);
            child.rotation.y = anim.startRotationY + angleDist * totalProgress;
        }

        // Position: determine which segment we're in and interpolate within it
        const segmentFloat = totalProgress * anim.waypoints.length;
        const segmentIndex = Math.min(Math.floor(segmentFloat), anim.waypoints.length - 1);
        const segmentT = segmentFloat - segmentIndex;

        // Store the starting position on first frame so we have a stable reference
        if (!anim.hasOwnProperty('startPosition')) {
            (anim as any).startPosition = child.position.clone().setY(0);
        }
        const startPos = segmentIndex === 0
            ? (anim as any).startPosition as THREE.Vector3
            : anim.waypoints[segmentIndex - 1];

        const endPos = anim.waypoints[segmentIndex];

        // Lerp within the current segment
        child.position.x = startPos.x + (endPos.x - startPos.x) * segmentT;
        child.position.z = startPos.z + (endPos.z - startPos.z) * segmentT;

        // Animation complete
        if (totalProgress >= 1) {
            const finalWaypoint = anim.waypoints[anim.waypoints.length - 1];
            child.position.x = finalWaypoint.x;
            child.position.z = finalWaypoint.z;
            if (anim.hasRotation) {
                child.rotation.y = anim.targetRotationY;
            }
            child.userData.pathAnimation = null;
        }
    }

    /**
     * Pulses emissive highlight on the active Rogue-mode ship.
     * Resets emissive to black on non-active ships.
     */
    private updateShipHighlighting(time: number, activeRogueShipId: string | null, isPlayerTurn: boolean): void {
        const shouldHighlight = Config.rogueMode && isPlayerTurn && activeRogueShipId;
        const currentIntensity = 0.2 + ((Math.sin(time * 5) + 1) / 2) * 0.6;
        const highlightColor = new THREE.Color(0xffff00), defaultColor = new THREE.Color(0x000000);

        this.playerBoardGroup.children.forEach(child => {
            if (child.userData.isShip) {
                const instancedMesh = child.userData.instancedMesh as THREE.InstancedMesh;
                if (instancedMesh?.material instanceof THREE.MeshStandardMaterial) {
                    if (shouldHighlight && child.userData.ship?.id === activeRogueShipId) {
                        instancedMesh.material.emissive.copy(highlightColor);
                        instancedMesh.material.emissiveIntensity = currentIntensity;
                    } else if (instancedMesh.material.emissiveIntensity > 0) {
                        instancedMesh.material.emissive.copy(defaultColor);
                        instancedMesh.material.emissiveIntensity = 0;
                    }
                }
            }
        });
    }

    /**
     * Shows/hides and animates the translucent placement zone highlight
     * during Rogue-mode setup phase.
     */
    private updatePlacementHighlight(time: number, isSetupPhase: boolean): void {
        if (!Config.rogueMode || !isSetupPhase) {
            if (this.placementHighlightMesh) this.placementHighlightMesh.visible = false;
            return;
        }

        if (!this.placementHighlightMesh) {
            const geo = new THREE.PlaneGeometry(6.9, 6.9);
            const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2, depthWrite: false });
            this.placementHighlightMesh = new THREE.Mesh(geo, mat);
            this.placementHighlightMesh.rotation.x = -Math.PI / 2;
            const offset = Config.board.width / 2;
            // Center of a 7x7 grid from (0,0) to (6,6) is (3,3).
            // In offset coords, 3 is at (3.5 - offset).
            this.placementHighlightMesh.position.set(3.5 - offset, 0.02, 3.5 - offset);
            this.playerBoardGroup.add(this.placementHighlightMesh);
        }

        this.placementHighlightMesh.visible = true;
        const currentIntensity = 0.1 + ((Math.sin(time * 5) + 1) / 2) * 0.2;
        (this.placementHighlightMesh.material as THREE.MeshBasicMaterial).opacity = currentIntensity;
    }
}
