import * as THREE from 'three';

export class InteractionManager {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  private camera: THREE.PerspectiveCamera;
  private entityManager: any; // We'll type this dynamically to avoid circular issues
  
  // Highlight cursor UI
  private hoverCursor: THREE.Mesh;
  public hoveredCell: { x: number, z: number } | null = null;
  
  private clickListeners: ((intersection: THREE.Intersection) => void)[] = [];

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, entityManager: any) {
    this.camera = camera;
    this.entityManager = entityManager;
    
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
    window.addEventListener('click', this.onMouseClick.bind(this));
  }

  public onClick(listener: (intersection: THREE.Intersection) => void) {
    this.clickListeners.push(listener);
  }

  private onMouseClick(_event: MouseEvent) {
    // We already have this.mouse updated from onMouseMove, 
    // but just in case, we use the stored mouse pos and update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const interacts = this.entityManager.getInteractableObjects();
    const intersects = this.raycaster.intersectObjects(interacts);
    if (intersects.length > 0) {
      const hit = intersects.find(i => i.object.userData.isGridTile);
      if (hit) {
        this.clickListeners.forEach(listener => listener(hit));
      }
    }
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
    const interacts = this.entityManager.getInteractableObjects();
    const intersects = this.raycaster.intersectObjects(interacts);

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
        
        // Ensure cursor inherits the board's rotation (UP or DOWN) by attaching to parent or copying quaternion
        this.hoverCursor.quaternion.copy(hit.object.parent!.quaternion);
        
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
