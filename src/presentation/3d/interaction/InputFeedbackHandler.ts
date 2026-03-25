import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { Orientation } from '../../../domain/fleet/Ship';

export class InputFeedbackHandler {
    public hoverCursor: THREE.Group;
    public ghostGroup: THREE.Group;
    public moveHighlightGroup: THREE.Group;
    private currentGhostSize: number = 0;

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

        // 3. Hover Cursor with custom shader
        this.hoverCursor = this.createHoverCursor();
        this.hoverCursor.visible = false;
        scene.add(this.hoverCursor);
    }

    private createHoverCursor(): THREE.Group {
        const glowVertexShader = `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `;
        const glowFragmentShader = `
          varying vec2 vUv;
          void main() {
            float hFade = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0);
            float vFade = pow(1.0 - vUv.y, 2.0);
            float alpha = hFade * vFade * 0.6;
            gl_FragColor = vec4(1.0, 0.95, 0.3, alpha);
          }
        `;
        const glowMat = new THREE.ShaderMaterial({
          vertexShader: glowVertexShader,
          fragmentShader: glowFragmentShader,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        });

        const glowGroup = new THREE.Group();
        const planeGeo = new THREE.PlaneGeometry(1.0, 2.5);
        const plane1 = new THREE.Mesh(planeGeo, glowMat);
        const plane2 = new THREE.Mesh(planeGeo, glowMat.clone());
        plane2.rotation.y = Math.PI / 2;
        glowGroup.add(plane1);
        glowGroup.add(plane2);
        glowGroup.renderOrder = 999;

        return glowGroup;
    }

    public updateGhost(ship: any, orientation: Orientation, pickedTile: THREE.Object3D, isValid: boolean) {
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
        pickedTile.getWorldPosition(ghostWorldPos);
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

    public updateHoverCursorFromUI(tile: THREE.Object3D) {
        const localOffset = new THREE.Vector3(0, 1.25, 0);
        const worldPos = tile.localToWorld(localOffset);
        this.hoverCursor.position.copy(worldPos);
        
        const boardQuat = new THREE.Quaternion();
        tile.getWorldQuaternion(boardQuat);
        this.hoverCursor.quaternion.copy(boardQuat);
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
