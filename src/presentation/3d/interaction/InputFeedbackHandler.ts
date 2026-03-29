import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { Orientation } from '../../../domain/fleet/Ship';
import { ThemeManager } from '../../theme/ThemeManager';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';

export class InputFeedbackHandler {
    public hoverCursor: THREE.Group;
    public ghostGroup: THREE.Group;
    public moveHighlightGroup: THREE.Group;
    private currentGhostSize: number = 0;
    private hoverCursorVoxels!: THREE.InstancedMesh;
    private dummy: THREE.Object3D = new THREE.Object3D();
    private readonly VOXEL_COUNT = 120;

    constructor(scene: THREE.Scene, entityManager: any) {
        // 1. Ghost Group for placement preview
        this.ghostGroup = new THREE.Group();
        this.ghostGroup.renderOrder = 999;
        this.ghostGroup.visible = false;
        scene.add(this.ghostGroup);

        // 2. Move Highlight Group for Rogue mode
        this.moveHighlightGroup = new THREE.Group();
        this.moveHighlightGroup.renderOrder = 998;
        this.moveHighlightGroup.visible = false;
        const highlightParent = entityManager.playerBoardGroup;
        highlightParent.add(this.moveHighlightGroup);

        // 3. Hover Cursor (Voxel Tornado)
        this.hoverCursor = this.createHoverCursor();
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

    private createHoverCursor(): THREE.Group {
        const voxelSize = 0.1;
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        const color = ThemeManager.getInstance().getPlayerShipColor();
        
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8,
            metalness: 0.8,
            roughness: 0.2
        });

        this.hoverCursorVoxels = new THREE.InstancedMesh(geometry, material, this.VOXEL_COUNT);
        this.hoverCursorVoxels.renderOrder = 999;
        this.hoverCursorVoxels.frustumCulled = false; // Always render while visible to avoid flicker

        const group = new THREE.Group();
        group.add(this.hoverCursorVoxels);
        return group;
    }

    public update(time: number) {
        if (!this.hoverCursorVoxels || !this.hoverCursor.visible) return;

        const totalHeight = 2.5;
        const speed = 0.005;
        const tightness = Math.PI * 4; 
        const baseRadius = 0.05;
        const topRadius = 0.7;
        
        // Helical spiral count
        const spiralCount = 6;
        const voxelsPerSpiral = this.VOXEL_COUNT / spiralCount;

        // Global pulsation
        const pulse = Math.sin(time * 0.004) * 0.15;

        for (let i = 0; i < this.VOXEL_COUNT; i++) {
            const spiralIndex = i % spiralCount;
            const stepInSpiral = Math.floor(i / spiralCount);
            const t = stepInSpiral / voxelsPerSpiral;

            const y = (t * totalHeight) - (totalHeight / 2);
            
            // 6-way helical offset
            const angleOffset = (spiralIndex / spiralCount) * Math.PI * 2;
            const angle = (time * speed) + (t * tightness) + angleOffset;
            
            // Funnel radius with pulsation
            const r = (baseRadius + (t * (topRadius - baseRadius))) * (1.0 + pulse * t);
            
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            this.dummy.position.set(x, y, z);
            
            // Individual voxel scale pulsation
            const individualPulse = Math.sin(time * 0.01 + t * 10.0) * 0.1;
            const scale = (0.7 + individualPulse) * (0.5 + t * 0.5);
            this.dummy.scale.setScalar(scale);
            
            this.dummy.rotation.set(angle, t * Math.PI, 0);
            
            this.dummy.updateMatrix();
            this.hoverCursorVoxels.setMatrixAt(i, this.dummy.matrix);
        }

        this.hoverCursorVoxels.instanceMatrix.needsUpdate = true;
    }

    public updateGhost(ship: any, orientation: Orientation, pickedTile: THREE.Object3D, isValid: boolean, x?: number, z?: number) {
        if (this.currentGhostSize !== ship.size) {
            this.buildGhost(ship.size);
            this.currentGhostSize = ship.size;
        }

        const color = isValid ? 0x00ff00 : 0xff0000;
        this.ghostGroup.children.forEach((child: THREE.Object3D, index: number) => {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshBasicMaterial;
            mat.color.setHex(color);

            let cx = 0;
            let cz = 0;
            if (orientation === Orientation.Horizontal) cx = index;
            else if (orientation === Orientation.Vertical) cz = index;
            else if (orientation === Orientation.Left) cx = -index;
            else if (orientation === Orientation.Up) cz = -index;

            mesh.position.set(cx, 0, cz);
        });

        const ghostWorldPos = new THREE.Vector3();
        if (x !== undefined && z !== undefined) {
            const localOffset = new THREE.Vector3(x - Config.board.width/2 + 0.5, 0, z - Config.board.width/2 + 0.5);
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
        this.hoverCursor.position.y += 1.25;
        this.hoverCursor.visible = true;
        this.hoverCursor.quaternion.identity();
        this.hoverCursor.scale.set(scaleX, 1, scaleZ);
    }

    public updateHoverCursorFromUI(tile: THREE.Object3D, scaleX: number = 1, scaleZ: number = 1) {
        const localOffset = new THREE.Vector3(0, 1.25, 0);
        const worldPos = tile.localToWorld(localOffset);
        this.hoverCursor.position.copy(worldPos);
        
        const boardQuat = new THREE.Quaternion();
        tile.getWorldQuaternion(boardQuat);
        this.hoverCursor.quaternion.copy(boardQuat);
        this.hoverCursor.scale.set(scaleX, 1, scaleZ);
        this.hoverCursor.visible = true;
    }

    public rebuildMoveHighlight(ship: any, board: any) {
        this.moveHighlightGroup.children.forEach((child: any) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
                else child.material.dispose();
            }
        });
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

    private buildGhost(size: number) {
        while (this.ghostGroup.children.length > 0) {
            const child = this.ghostGroup.children[0] as THREE.Mesh;
            this.ghostGroup.remove(child);
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
        }

        const ghostGeo = new THREE.BoxGeometry(0.85, 0.45, 0.85);

        for (let i = 0; i < size; i++) {
            const ghostMat = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.6,
                depthTest: false
            });
            const mesh = new THREE.Mesh(ghostGeo, ghostMat);
            this.ghostGroup.add(mesh);
        }
    }

    public hideAll() {
        this.ghostGroup.visible = false;
        this.hoverCursor.visible = false;
        this.moveHighlightGroup.visible = false;
    }
}
