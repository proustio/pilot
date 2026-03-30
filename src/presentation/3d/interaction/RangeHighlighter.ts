import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';

/**
 * Handles move highlight, vision range, and attack range highlight
 * mesh building for Rogue mode.
 *
 * Extracted from InputFeedbackHandler to keep that class focused on
 * hover cursor, ghost preview, and tornado animation.
 */
export class RangeHighlighter {
    public moveHighlightGroup: THREE.Group;
    public visionHighlightGroup: THREE.Group;
    public attackHighlightGroup: THREE.Group;

    constructor(highlightParent: THREE.Object3D) {
        this.moveHighlightGroup = new THREE.Group();
        this.moveHighlightGroup.renderOrder = 998;
        this.moveHighlightGroup.visible = false;
        highlightParent.add(this.moveHighlightGroup);

        this.visionHighlightGroup = new THREE.Group();
        this.visionHighlightGroup.renderOrder = 997;
        highlightParent.add(this.visionHighlightGroup);

        this.attackHighlightGroup = new THREE.Group();
        this.attackHighlightGroup.renderOrder = 996;
        highlightParent.add(this.attackHighlightGroup);
    }

    public rebuildMoveHighlight(ship: any, board: any): void {
        this.disposeGroupChildren(this.moveHighlightGroup);
        this.moveHighlightGroup.clear();

        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false
        });
        const geo = new THREE.PlaneGeometry(0.9, 0.9);

        const boardOffset = Config.board.width / 2;
        const moves = ship.movesRemaining;

        for (let x = 0; x < board.width; x++) {
            for (let z = 0; z < board.height; z++) {
                const dx = Math.abs(x - ship.headX);
                const dz = Math.abs(z - ship.headZ);
                if (dx + dz > 0 && dx + dz <= moves) {
                    const targetX = x - boardOffset + 0.5;
                    const targetZ = z - boardOffset + 0.5;
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.set(targetX, 0.2, targetZ);
                    mesh.renderOrder = 999;
                    this.moveHighlightGroup.add(mesh);
                }
            }
        }
    }

    public rebuildRangeHighlights(ship: any, board: any): void {
        this.disposeGroupChildren(this.visionHighlightGroup);
        this.visionHighlightGroup.clear();
        this.disposeGroupChildren(this.attackHighlightGroup);
        this.attackHighlightGroup.clear();

        if (!ship || !ship.isPlaced) return;

        const boardOffset = Config.board.width / 2;
        const visionRadius = ship.visionRadius || 5;
        const attackRadius = visionRadius * 2;

        const visionMat = new THREE.MeshBasicMaterial({
            color: 0x4169E1, // Royal Blue
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const attackMat = new THREE.MeshBasicMaterial({
            color: 0xFFA500, // Orange
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const geo = new THREE.PlaneGeometry(0.95, 0.95);

        for (let x = 0; x < board.width; x++) {
            for (let z = 0; z < board.height; z++) {
                const dist = Math.abs(x - ship.headX) + Math.abs(z - ship.headZ);

                if (dist > 0 && dist <= attackRadius) {
                    const targetX = x - boardOffset + 0.5;
                    const targetZ = z - boardOffset + 0.5;

                    const isVision = dist <= visionRadius;
                    const mesh = new THREE.Mesh(geo, isVision ? visionMat : attackMat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.set(targetX, 0.15, targetZ);

                    if (isVision) {
                        this.visionHighlightGroup.add(mesh);
                    } else {
                        this.attackHighlightGroup.add(mesh);
                    }
                }
            }
        }
    }

    public hideAll(): void {
        this.moveHighlightGroup.visible = false;
        this.visionHighlightGroup.visible = false;
        this.attackHighlightGroup.visible = false;
    }

    private disposeGroupChildren(group: THREE.Group): void {
        group.children.forEach((child: any) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
                else child.material.dispose();
            }
        });
    }
}
