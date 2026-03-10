import * as THREE from 'three';

export class InteractionManager {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  private camera: THREE.PerspectiveCamera;
  private interactableObjects: THREE.Object3D[];
  
  // Highlight cursor UI
  private hoverCursor: THREE.Mesh;
  public hoveredCell: { x: number, z: number } | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, interactableObjects: THREE.Object3D[]) {
    this.camera = camera;
    this.interactableObjects = interactableObjects;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Create the visual hover cursor
    const cursorGeo = new THREE.BoxGeometry(1.05, 0.25, 1.05); // Slightly larger than tile
    const cursorMat = new THREE.MeshBasicMaterial({ 
      color: 0xffff00, 
      transparent: true, 
      opacity: 0.5,
      depthTest: false, // Ensure it draws over
      wireframe: true 
    });
    this.hoverCursor = new THREE.Mesh(cursorGeo, cursorMat);
    this.hoverCursor.visible = false;
    scene.add(this.hoverCursor);

    // Bind event listeners
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
  }

  private onMouseMove(event: MouseEvent) {
    // Normalize mouse coordinates to -1 to +1 range
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  public update() {
    // Update raycaster with current camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Test intersections against the board tiles
    const intersects = this.raycaster.intersectObjects(this.interactableObjects);

    if (intersects.length > 0) {
      // Find first valid grid tile (since there may be overlaps or parent groups)
      const hit = intersects.find(i => i.object.userData.isGridTile);
      
      if (hit) {
        // Snap cursor to tile position
        this.hoverCursor.position.copy(hit.object.position);
        this.hoverCursor.visible = true;
        
        this.hoveredCell = {
          x: hit.object.userData.cellX,
          z: hit.object.userData.cellZ
        };
      } else {
        this.hoverCursor.visible = false;
        this.hoveredCell = null;
      }
    } else {
      this.hoverCursor.visible = false;
      this.hoveredCell = null;
    }
  }
}
