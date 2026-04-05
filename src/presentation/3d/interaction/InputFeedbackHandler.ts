import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { Orientation } from '../../../domain/fleet/Ship';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { RangeHighlighter } from './RangeHighlighter';
import TornadoVert from '../shaders/Tornado.vert?raw';
import TornadoFrag from '../shaders/Tornado.frag?raw';

export class InputFeedbackHandler {
    public hoverCursor: THREE.Group;
    public ghostGroup: THREE.Group;
    private rangeHighlighter: RangeHighlighter;
    private hoverCursorVoxels!: THREE.InstancedMesh;
    private tornadoMaterial!: THREE.ShaderMaterial;
    private readonly VOXEL_COUNT = 120;
    private readonly MAX_GHOST_SIZE = 5; // Max standard ship size
    private isEnemyCursor: boolean = false;

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

        for (let i = 0; i < this.VOXEL_COUNT; i++) {
            this.hoverCursorVoxels.setColorAt(i, color);
        }
        if (this.hoverCursorVoxels.instanceColor) {
            this.hoverCursorVoxels.instanceColor.needsUpdate = true;
        }
    }

    private createHoverCursor(isEnemy: boolean): THREE.Group {
        this.isEnemyCursor = isEnemy;
        const voxelSize = 0.1;
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        const color = isEnemy ? new THREE.Color(0xFF0000) : ThemeManager.getInstance().getPlayerShipColor();

        const indices = new Float32Array(this.VOXEL_COUNT);
        for (let i = 0; i < this.VOXEL_COUNT; i++) {
            indices[i] = i;
        }
        geometry.setAttribute('voxelIndex', new THREE.InstancedBufferAttribute(indices, 1));

        this.tornadoMaterial = new THREE.ShaderMaterial({
            vertexShader: TornadoVert,
            fragmentShader: TornadoFrag,
            uniforms: {
                time: { value: 0 }
            },
            transparent: true,
            depthWrite: false
        });

        const instMesh = new THREE.InstancedMesh(geometry, this.tornadoMaterial, this.VOXEL_COUNT);
        instMesh.renderOrder = 999;
        instMesh.frustumCulled = false;

        const identity = new THREE.Matrix4();
        for (let i = 0; i < this.VOXEL_COUNT; i++) {
            instMesh.setMatrixAt(i, identity);
            instMesh.setColorAt(i, color);
        }

        this.hoverCursorVoxels = instMesh;

        const group = new THREE.Group();
        group.add(instMesh);
        return group;
    }

    public update(time: number) {
        if (!this.hoverCursorVoxels || !this.hoverCursor.visible) return;

        const speed = this.isEnemyCursor ? -0.007 : 0.005;
        this.tornadoMaterial.uniforms.time.value = time * speed;
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

                let cx = 0;
                let cz = 0;
                if (orientation === Orientation.Horizontal) cx = index;
                else if (orientation === Orientation.Vertical) cz = index;
                else if (orientation === Orientation.Left) cx = -index;
                else if (orientation === Orientation.Up) cz = -index;

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
