import * as THREE from 'three';

export class EntityManager {
  private scene: THREE.Scene;
  private gridGroup: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.gridGroup = new THREE.Group();
    this.scene.add(this.gridGroup);

    this.createPlaceholderBoard();
  }

  private createPlaceholderBoard() {
    // Create a 10x10 playable grid. Center it around 0,0
    const boardSize = 10;
    const offset = boardSize / 2; // to center it

    // Create a large visible plane for the "water surface" underneath
    const waterGeometry = new THREE.PlaneGeometry(30, 30);
    // Voxel-like flat shading color
    const waterMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1E90FF, 
      roughness: 0.1, 
      metalness: 0.1 
    });
    
    const waterPlane = new THREE.Mesh(waterGeometry, waterMaterial);
    waterPlane.rotation.x = -Math.PI / 2; // Flat on the floor
    waterPlane.position.y = -0.5; // Slightly below blocks
    waterPlane.receiveShadow = true;
    this.scene.add(waterPlane);

    // Create interactable grid tiles (invisible or somewhat transparent borders)
    const tileGeometry = new THREE.BoxGeometry(0.95, 0.2, 0.95);
    const tileMaterial = new THREE.MeshStandardMaterial({
      color: 0x0000ff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false
    });

    for (let x = 0; x < boardSize; x++) {
      for (let z = 0; z < boardSize; z++) {
        const tile = new THREE.Mesh(tileGeometry, tileMaterial);
        
        // Calculate world coordinates (1 unit per tile). Center around origin.
        const worldX = x - offset + 0.5;
        const worldZ = z - offset + 0.5;
        
        tile.position.set(worldX, -0.1, worldZ);
        tile.receiveShadow = true;
        
        // Assign userData so raycaster can identify cell coordinates
        tile.userData = { isGridTile: true, cellX: x, cellZ: z };
        
        this.gridGroup.add(tile);
      }
    }

    // Reference GridHelper overlay just for visual debug
    const gridHelper = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
    gridHelper.position.y = 0.01;
    gridHelper.material.opacity = 0.5;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);
  }

  /**
   * Returns the list of objects that the Raycaster should test against (only grid tiles).
   */
  public getInteractableObjects(): THREE.Object3D[] {
    return this.gridGroup.children;
  }
}
