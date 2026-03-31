import * as THREE from 'three';
import { ThemeManager } from '../../theme/ThemeManager';

/**
 * Result of BoardMeshFactory.build() — includes material refs for theme updates
 * and LED InstancedMesh ref for per-frame pulse animation.
 */
export interface BoardMeshBuildResult {
    frameMat: THREE.MeshStandardMaterial;
    rivetMat: THREE.MeshStandardMaterial;
    screwMat: THREE.MeshStandardMaterial;
    ledMesh: THREE.InstancedMesh;
    ledPhases: number[];
}

/**
 * Creates the structural board meshes: frame borders, tactical base,
 * corner brackets with LEDs, rivets, screws, and bottom plane.
 *
 * Uses InstancedMesh for repeated decorations to minimize draw calls:
 *   1 InstancedMesh(32) for rivets
 *   1 InstancedMesh(4)  for screw heads
 *   1 InstancedMesh(4)  for screw slots
 *   1 InstancedMesh(4)  for brackets
 *   1 InstancedMesh(4)  for LEDs
 *   1 InstancedMesh(4)  for borders
 *   1 Mesh              for base
 *   1 Mesh              for bottom plane
 * Total: 8 draw calls (down from ~52).
 */
export class BoardMeshFactory {
    public static build(
        masterBoardGroup: THREE.Group,
        staticGroup: THREE.Group,
        boardSize: number,
        offset: number
    ): BoardMeshBuildResult {
        const industrialTex = ThemeManager.getInstance().getIndustrialTexture();
        const tm = ThemeManager.getInstance();
        const dummy = new THREE.Object3D();

        // ───── Frame Material ─────
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x222233,
            map: industrialTex,
            metalness: 0.9,
            roughness: 0.2,
            emissive: 0x000022,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        const borderOffset = offset + 0.15;
        const borderLength = boardSize + 0.3;

        // ───── Frame Borders (4 → 1 InstancedMesh) ─────
        const borders = [
            { x: borderLength, y: 0.15, z: 0.15, posZ: -borderOffset, posX: 0 },
            { x: borderLength, y: 0.15, z: 0.15, posZ: borderOffset, posX: 0 },
            { x: 0.15, y: 0.15, z: borderLength, posZ: 0, posX: -borderOffset },
            { x: 0.15, y: 0.15, z: borderLength, posZ: 0, posX: borderOffset }
        ];

        // Use the largest border dimensions for the shared geometry
        const borderGeo = new THREE.BoxGeometry(1, 1, 1);
        const borderInstancedMesh = new THREE.InstancedMesh(borderGeo, frameMat, 4);
        borderInstancedMesh.castShadow = true;
        borderInstancedMesh.receiveShadow = true;

        borders.forEach((b, i) => {
            dummy.position.set(b.posX, 0, b.posZ);
            dummy.scale.set(b.x, b.y, b.z);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            borderInstancedMesh.setMatrixAt(i, dummy.matrix);
        });
        borderInstancedMesh.instanceMatrix.needsUpdate = true;
        masterBoardGroup.add(borderInstancedMesh);

        // ───── Tactical Base (individual mesh — kept as-is) ─────
        const baseGeo = new THREE.BoxGeometry(boardSize + 2, 0.4, boardSize + 2);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x050510,
            metalness: 0.9,
            roughness: 0.4,
            transparent: true,
            opacity: 0.8
        });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.y = -2.4;
        staticGroup.add(baseMesh);

        // ───── Corner Brackets (4 → 1 InstancedMesh) ─────
        const bracketGeo = new THREE.BoxGeometry(0.8, 2.4, 0.8);
        const bracketPos = borderOffset + 0.2;
        const cornerPositions = [
            { x: bracketPos, z: bracketPos },
            { x: -bracketPos, z: bracketPos },
            { x: bracketPos, z: -bracketPos },
            { x: -bracketPos, z: -bracketPos }
        ];

        const bracketInstancedMesh = new THREE.InstancedMesh(bracketGeo, frameMat, 4);
        cornerPositions.forEach((pos, i) => {
            dummy.position.set(pos.x, -1.8, pos.z);
            dummy.scale.set(1, 1, 1);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            bracketInstancedMesh.setMatrixAt(i, dummy.matrix);
        });
        bracketInstancedMesh.instanceMatrix.needsUpdate = true;
        staticGroup.add(bracketInstancedMesh);

        // ───── Status LEDs (4 → 1 InstancedMesh) ─────
        const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x4169E1, transparent: true });
        const ledInstancedMesh = new THREE.InstancedMesh(ledGeo, ledMat, 4);
        const ledPhases: number[] = [];

        cornerPositions.forEach((pos, i) => {
            dummy.position.set(pos.x * 1.1, 0.2, pos.z * 1.1);
            dummy.scale.set(1, 1, 1);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            ledInstancedMesh.setMatrixAt(i, dummy.matrix);
            ledPhases.push(Math.random() * Math.PI);
        });
        // Force instanceColor buffer creation for per-LED opacity animation
        const white = new THREE.Color(0x4169E1);
        for (let i = 0; i < 4; i++) {
            ledInstancedMesh.setColorAt(i, white);
        }
        ledInstancedMesh.instanceMatrix.needsUpdate = true;
        ledInstancedMesh.instanceColor!.needsUpdate = true;
        staticGroup.add(ledInstancedMesh);

        // ───── Rivets (32 → 1 InstancedMesh) ─────
        const rivetGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6);
        const rivetMat = new THREE.MeshStandardMaterial({ color: tm.getRivetColor(), metalness: 0.8, roughness: 0.2 });

        const rivetInstancedMesh = new THREE.InstancedMesh(rivetGeo, rivetMat, 32);
        let rivetIndex = 0;

        const writeRivets = (count: number, start: THREE.Vector3, end: THREE.Vector3) => {
            for (let i = 0; i < count; i++) {
                const t = i / (count - 1);
                dummy.position.lerpVectors(start, end, t);
                dummy.scale.set(1, 1, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                rivetInstancedMesh.setMatrixAt(rivetIndex++, dummy.matrix);
            }
        };

        const rD = borderOffset;
        const rH = 0.08;
        writeRivets(8, new THREE.Vector3(-offset, rH, rD), new THREE.Vector3(offset, rH, rD));
        writeRivets(8, new THREE.Vector3(-offset, rH, -rD), new THREE.Vector3(offset, rH, -rD));
        writeRivets(8, new THREE.Vector3(rD, rH, -offset), new THREE.Vector3(rD, rH, offset));
        writeRivets(8, new THREE.Vector3(-rD, rH, -offset), new THREE.Vector3(-rD, rH, offset));

        rivetInstancedMesh.instanceMatrix.needsUpdate = true;
        masterBoardGroup.add(rivetInstancedMesh);

        // ───── Screws: heads (4 → 1 InstancedMesh) + slots (4 → 1 InstancedMesh) ─────
        const screwGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8);
        const screwMat = new THREE.MeshStandardMaterial({
            color: tm.getScrewColor(),
            metalness: 0.9,
            roughness: 0.1
        });
        const screwSlotGeo = new THREE.BoxGeometry(0.18, 0.02, 0.02);
        const screwSlotMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        const screwHeadInstancedMesh = new THREE.InstancedMesh(screwGeo, screwMat, 4);
        const screwSlotInstancedMesh = new THREE.InstancedMesh(screwSlotGeo, screwSlotMat, 4);

        const screwPositions = [
            { x: borderOffset + 0.25, z: borderOffset + 0.25 },
            { x: -(borderOffset + 0.25), z: borderOffset + 0.25 },
            { x: borderOffset + 0.25, z: -(borderOffset + 0.25) },
            { x: -(borderOffset + 0.25), z: -(borderOffset + 0.25) }
        ];

        screwPositions.forEach((pos, i) => {
            // Screw head — rotated 90° around X, positioned at screw location
            dummy.position.set(pos.x, 0.2, pos.z);
            dummy.scale.set(1, 1, 1);
            dummy.rotation.set(Math.PI / 2, 0, 0);
            dummy.updateMatrix();
            screwHeadInstancedMesh.setMatrixAt(i, dummy.matrix);

            // Screw slot — rotated 90° around X, offset slightly above head
            dummy.position.set(pos.x, 0.24, pos.z);
            dummy.rotation.set(Math.PI / 2, 0, 0);
            dummy.updateMatrix();
            screwSlotInstancedMesh.setMatrixAt(i, dummy.matrix);
        });

        screwHeadInstancedMesh.instanceMatrix.needsUpdate = true;
        screwSlotInstancedMesh.instanceMatrix.needsUpdate = true;
        staticGroup.add(screwHeadInstancedMesh);
        staticGroup.add(screwSlotInstancedMesh);

        // ───── Bottom Plane (individual mesh — kept as-is) ─────
        const bottomGeo = new THREE.PlaneGeometry(boardSize, boardSize);
        const bottomMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.4,
            roughness: 0.6,
            side: THREE.DoubleSide
        });
        const bottomPlane = new THREE.Mesh(bottomGeo, bottomMat);
        bottomPlane.rotation.x = -Math.PI / 2;
        bottomPlane.position.y = 0;
        bottomPlane.receiveShadow = true;
        masterBoardGroup.add(bottomPlane);

        return { frameMat, rivetMat, screwMat, ledMesh: ledInstancedMesh, ledPhases };
    }
}
