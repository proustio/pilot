import * as THREE from 'three';
import { ThemeManager } from '../../theme/ThemeManager';

/**
 * Creates the structural board meshes: frame borders, tactical base,
 * corner brackets with LEDs, rivets, screws, and bottom plane.
 */
export class BoardMeshFactory {
    /**
     * Builds all structural board elements and adds them to the provided groups.
     * Returns references to rivet/screw/frame materials for theme updates.
     */
    public static build(
        masterBoardGroup: THREE.Group,
        staticGroup: THREE.Group,
        boardSize: number,
        offset: number
    ): { frameMat: THREE.MeshStandardMaterial; rivetMat: THREE.MeshStandardMaterial; screwMat: THREE.MeshStandardMaterial } {
        const industrialTex = ThemeManager.getInstance().getIndustrialTexture();
        const tm = ThemeManager.getInstance();

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

        // ───── Frame Borders ─────
        const borders = [
            { x: borderLength, y: 0.15, z: 0.15, posZ: -borderOffset, posX: 0 },
            { x: borderLength, y: 0.15, z: 0.15, posZ: borderOffset, posX: 0 },
            { x: 0.15, y: 0.15, z: borderLength, posZ: 0, posX: -borderOffset },
            { x: 0.15, y: 0.15, z: borderLength, posZ: 0, posX: borderOffset }
        ];

        borders.forEach(b => {
            const borderGeo = new THREE.BoxGeometry(b.x, b.y, b.z);
            const borderMesh = new THREE.Mesh(borderGeo, frameMat);
            borderMesh.position.set(b.posX, 0, b.posZ);
            borderMesh.castShadow = true;
            borderMesh.receiveShadow = true;
            masterBoardGroup.add(borderMesh);
        });

        // ───── Tactical Base ─────
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

        // ───── Corner Brackets + LEDs ─────
        const bracketGeo = new THREE.BoxGeometry(0.8, 2.4, 0.8);
        const bracketPos = borderOffset + 0.2;
        const cornerPositions = [
            { x: bracketPos, z: bracketPos },
            { x: -bracketPos, z: bracketPos },
            { x: bracketPos, z: -bracketPos },
            { x: -bracketPos, z: -bracketPos }
        ];

        cornerPositions.forEach(pos => {
            const bracket = new THREE.Mesh(bracketGeo, frameMat);
            bracket.position.set(pos.x, -1.8, pos.z);
            staticGroup.add(bracket);

            const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
            const ledMat = new THREE.MeshBasicMaterial({ color: 0x4169E1, transparent: true });
            const led = new THREE.Mesh(ledGeo, ledMat);
            led.position.set(pos.x * 1.1, 0.2, pos.z * 1.1);
            led.userData = { isStatusLED: true, phase: Math.random() * Math.PI };
            staticGroup.add(led);
        });

        // ───── Rivets ─────
        const rivetGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6);
        const rivetMat = new THREE.MeshStandardMaterial({ color: tm.getRivetColor(), metalness: 0.8, roughness: 0.2 });

        const spawnRivets = (count: number, start: THREE.Vector3, end: THREE.Vector3) => {
            for (let i = 0; i < count; i++) {
                const rivet = new THREE.Mesh(rivetGeo, rivetMat);
                const t = i / (count - 1);
                rivet.position.lerpVectors(start, end, t);
                masterBoardGroup.add(rivet);
            }
        };

        const rD = borderOffset;
        const rH = 0.08;
        spawnRivets(8, new THREE.Vector3(-offset, rH, rD), new THREE.Vector3(offset, rH, rD));
        spawnRivets(8, new THREE.Vector3(-offset, rH, -rD), new THREE.Vector3(offset, rH, -rD));
        spawnRivets(8, new THREE.Vector3(rD, rH, -offset), new THREE.Vector3(rD, rH, offset));
        spawnRivets(8, new THREE.Vector3(-rD, rH, -offset), new THREE.Vector3(-rD, rH, offset));

        // ───── Screws ─────
        const screwGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8);
        const screwMat = new THREE.MeshStandardMaterial({
            color: tm.getScrewColor(),
            metalness: 0.9,
            roughness: 0.1
        });
        const screwSlotGeo = new THREE.BoxGeometry(0.18, 0.02, 0.02);
        const screwSlotMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        const screwPositions = [
            { x: borderOffset + 0.25, z: borderOffset + 0.25 },
            { x: -(borderOffset + 0.25), z: borderOffset + 0.25 },
            { x: borderOffset + 0.25, z: -(borderOffset + 0.25) },
            { x: -(borderOffset + 0.25), z: -(borderOffset + 0.25) }
        ];

        screwPositions.forEach(pos => {
            const screwGroup = new THREE.Group();
            const screwHead = new THREE.Mesh(screwGeo, screwMat);
            const screwSlot = new THREE.Mesh(screwSlotGeo, screwSlotMat);
            screwHead.rotation.x = Math.PI / 2;
            screwSlot.rotation.x = Math.PI / 2;
            screwSlot.position.y = 0.04;
            screwGroup.add(screwHead);
            screwGroup.add(screwSlot);

            const topScrew = screwGroup.clone();
            topScrew.position.set(pos.x, 0.2, pos.z);
            staticGroup.add(topScrew);
        });

        // ───── Bottom Plane ─────
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

        return { frameMat, rivetMat, screwMat };
    }
}
