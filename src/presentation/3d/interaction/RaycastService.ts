import * as THREE from 'three';

export class RaycastService {
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private lastRaycastX: number = -999;
    private lastRaycastY: number = -999;
    private lastCameraMatrix: THREE.Matrix4 = new THREE.Matrix4();
    private lastPickedTile: THREE.Object3D | null = null;
    private camera: THREE.PerspectiveCamera;
    private entityManager: any;

    constructor(camera: THREE.PerspectiveCamera, entityManager: any) {
        this.camera = camera;
        this.entityManager = entityManager;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    public updateMouse(clientX: number, clientY: number): void {
        this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    }

    public getMouse(): THREE.Vector2 {
        return this.mouse;
    }

    /**
     * Performs raycasting to find the currently hovered grid tile.
     * Optimized to only cast if mouse or camera has moved.
     */
    public getPickedTile(): THREE.Object3D | null {
        let pickedTile: THREE.Object3D | null = null;

        const mouseMoved = Math.abs(this.mouse.x - this.lastRaycastX) > 0.001 || 
                          Math.abs(this.mouse.y - this.lastRaycastY) > 0.001;
        const cameraMoved = !this.lastCameraMatrix.equals(this.camera.matrixWorld);

        if (mouseMoved || cameraMoved) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const interacts = this.entityManager.getInteractableObjects();
            const intersects = this.raycaster.intersectObjects(interacts);

            if (intersects.length > 0) {
                const hit = intersects.find((i: THREE.Intersection) => i.object.userData.isGridTile);
                if (hit) pickedTile = hit.object;
            }

            // Ensure pickedTile is still valid/attached
            if (pickedTile && !pickedTile.parent) pickedTile = null;

            this.lastRaycastX = this.mouse.x;
            this.lastRaycastY = this.mouse.y;
            this.lastCameraMatrix.copy(this.camera.matrixWorld);
            this.lastPickedTile = pickedTile;
        } else {
            pickedTile = this.lastPickedTile;
            if (pickedTile && !pickedTile.parent) {
                pickedTile = null;
                this.lastPickedTile = null;
            }
        }

        return pickedTile;
    }

    public getIntersections(interacts: THREE.Object3D[]): THREE.Intersection[] {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        return this.raycaster.intersectObjects(interacts);
    }
}
