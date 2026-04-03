import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { Orientation } from '../../../domain/fleet/Ship';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { RangeHighlighter } from './RangeHighlighter';

export class InputFeedbackHandler {
    public hoverCursor: THREE.Group;
    public ghostGroup: THREE.Group;
    private rangeHighlighter: RangeHighlighter;
    private hoverCursorVoxels!: THREE.InstancedMesh;
    private dummy: THREE.Object3D = new THREE.Object3D();
    private readonly VOXEL_COUNT = 120;
    private readonly MAX_GHOST_SIZE = 5; // Max standard ship size

    // Expose highlight groups via delegation
    public get moveHighlightGroup(): THREE.Group { return this.rangeHighlighter.moveHighlightGroup; }
    public get visionHighlightGroup(): THREE.Group { return this.rangeHighlighter.visionHighlightGroup; }
    public get attackHighlightGroup(): THREE.Group { return this.rangeHighlighter.attackHighlightGroup; }

    constructor(scene: THREE.Scene, entityManager: any) {
        // 1. Ghost Group for placement preview
        this.ghostGroup = new THREE.Group();
        this.ghostGroup.renderOrder = 999;
        this.ghostGroup.visible = false;
        scene.add(this.ghostGroup);

        // 2. Range highlighting (move, vision, attack)
        const highlightParent = entityManager.playerBoardGroup;
        this.rangeHighlighter = new RangeHighlighter(highlightParent);

        // 3. Hover Cursor (Voxel Tornado)
        this.hoverCursor = this.createHoverCursor(false);
        this.hoverCursor.visible = false;
        scene.add(this.hoverCursor);

        // Handle Dynamic Themes
        eventBus.on(GameEventType.THEME_CHANGED, () => this.updateVoxelTheme());
    }

    private updateVoxelTheme() {
        if (!this.hoverCursorVoxels) return;
        const color = ThemeManager.getInstance().getPlayerShipColor();
        const mat = this.hoverCursorVoxels.material as THREE.MeshStandardMaterial;
        mat.color.copy(color);
        mat.emissive.copy(color).multiplyScalar(0.5);

        for (let i = 0; i < this.VOXEL_COUNT; i++) {
            this.hoverCursorVoxels.setColorAt(i, color);
        }
        if (this.hoverCursorVoxels.instanceColor) {
            this.hoverCursorVoxels.instanceColor.needsUpdate = true;
        }
    }

    private createHoverCursor(isEnemy: boolean): THREE.Group {
        const voxelSize = 0.1;
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        const color = isEnemy ? new THREE.Color(0xFF0000) : ThemeManager.getInstance().getPlayerShipColor();

        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8,
            metalness: 0.8,
            roughness: 0.2
        });

        const instMesh = new THREE.InstancedMesh(geometry, material, this.VOXEL_COUNT);
        instMesh.renderOrder = 999;
        instMesh.frustumCulled = false;

        this.hoverCursorVoxels = instMesh;

        const group = new THREE.Group();
        group.add(instMesh);
        return group;
    }

    public update(time: number) {
        this.updateTornado(this.hoverCursorVoxels, this.hoverCursor, time, false);
    }

    private updateTornado(mesh: THREE.InstancedMesh, group: THREE.Group, time: number, isEnemy: boolean) {
        if (!mesh || !group.visible) return;

        const totalHeight = 2.5;
        const speed = isEnemy ? -0.007 : 0.005;
        const tightness = Math.PI * 4;
        const baseRadius = 0.05;
        const topRadius = 0.7;

        const spiralCount = 6;
        const voxelsPerSpiral = this.VOXEL_COUNT / spiralCount;

        const pulse = Math.sin(time * 0.004) * 0.15;

        for (let i = 0; i < this.VOXEL_COUNT; i++) {
            const spiralIndex = i % spiralCount;
            const stepInSpiral = Math.floor(i / spiralCount);
            const t = stepInSpiral / voxelsPerSpiral;

            // Tornado extends upward from y=0 (group origin sits at water level)
            const y = t * totalHeight;

            const angleOffset = (spiralIndex / spiralCount) * Math.PI * 2;
            const angle = (time * speed) + (t * tightness) + angleOffset;

            const r = (baseRadius + (t * (topRadius - baseRadius))) * (1.0 + pulse * t);

            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            this.dummy.position.set(x, y, z);

            const individualPulse = Math.sin(time * 0.01 + t * 10.0) * 0.1;
            const scale = (0.7 + individualPulse) * (0.5 + t * 0.5);
            this.dummy.scale.setScalar(scale);

            this.dummy.rotation.set(angle, t * Math.PI, 0);

            this.dummy.updateMatrix();
            mesh.setMatrixAt(i, this.dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
    }

    public updateGhost(ship: any, orientation: Orientation, pickedTile: THREE.Object3D, isValid: boolean, x?: number, z?: number) {
        if (this.ghostGroup.children.length === 0) {
            this.buildGhostPool();
        }

        const color = isValid ? 0x00ff00 : 0xff0000;
        this.ghostGroup.children.forEach((child: THREE.Object3D, index: number) => {
            const mesh = child as THREE.Mesh;
            if (index < ship.size) {
                mesh.visible = true;
                const mat = mesh.material as THREE.MeshBasicMaterial;
                mat.color.setHex(color);

                // Anchor the ghost at the bow (front): segment (size-1) sits at the cursor,
                // and the remaining segments extend backward from there.
                const s = ship.size - 1;
                let cx = 0;
                let cz = 0;
                if (orientation === Orientation.Horizontal) cx = index - s;      // stern..bow → left..cursor
                else if (orientation === Orientation.Vertical) cz = index - s;   // stern..bow → up..cursor
                else if (orientation === Orientation.Left) cx = s - index;       // stern..bow → right..cursor
                else if (orientation === Orientation.Up) cz = s - index;         // stern..bow → down..cursor

                mesh.position.set(cx, 0, cz);
            } else {
                mesh.visible = false; // Hide unused pooled voxels
            }
        });

        const ghostWorldPos = new THREE.Vector3();
        if (x !== undefined && z !== undefined) {
            const localOffset = new THREE.Vector3(x - Config.board.width / 2 + 0.5, 0, z - Config.board.width / 2 + 0.5);
            const boardGrp = pickedTile.parent || pickedTile;
            boardGrp.localToWorld(localOffset);
            ghostWorldPos.copy(localOffset);
        } else {
            pickedTile.getWorldPosition(ghostWorldPos);
        }

        this.ghostGroup.position.copy(ghostWorldPos);
        this.ghostGroup.position.y += 0.45;
        this.ghostGroup.quaternion.copy(pickedTile.parent!.quaternion);
        this.ghostGroup.visible = true;
    }

    public updateHoverCursor(pickedTile: THREE.Object3D, scaleX: number = 1, scaleZ: number = 1) {
        const worldPos = new THREE.Vector3();
        pickedTile.getWorldPosition(worldPos);
        this.hoverCursor.position.copy(worldPos);
        this.hoverCursor.position.y -= 0.25;
        this.hoverCursor.visible = true;
        this.hoverCursor.quaternion.identity();
        this.hoverCursor.scale.set(scaleX, 1, scaleZ);
    }

    public updateHoverCursorFromUI(tile: THREE.Object3D, scaleX: number = 1, scaleZ: number = 1) {
        const localOffset = new THREE.Vector3(0, -0.25, 0);
        const worldPos = tile.localToWorld(localOffset);
        this.hoverCursor.position.copy(worldPos);

        const boardQuat = new THREE.Quaternion();
        tile.getWorldQuaternion(boardQuat);
        this.hoverCursor.quaternion.copy(boardQuat);
        this.hoverCursor.scale.set(scaleX, 1, scaleZ);
        this.hoverCursor.visible = true;
    }

    // Delegate range highlighting to RangeHighlighter
    public rebuildMoveHighlight(ship: any, board: any): void {
        this.rangeHighlighter.rebuildMoveHighlight(ship, board);
    }

    public rebuildRangeHighlights(ship: any, board: any): void {
        this.rangeHighlighter.rebuildRangeHighlights(ship, board);
    }

    private buildGhostPool() {
        const ghostGeo = new THREE.BoxGeometry(0.85, 0.45, 0.85);
        // Share a single material across all segments for performance
        const ghostMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.6,
            depthTest: false
        });

        // Pre-build the maximum possible size and toggle visibility later
        for (let i = 0; i < this.MAX_GHOST_SIZE; i++) {
            const mesh = new THREE.Mesh(ghostGeo, ghostMat);
            mesh.visible = false;
            this.ghostGroup.add(mesh);
        }
    }

    public hideAll() {
        this.ghostGroup.visible = false;
        this.hoverCursor.visible = false;
        this.rangeHighlighter.hideAll();
    }
}
