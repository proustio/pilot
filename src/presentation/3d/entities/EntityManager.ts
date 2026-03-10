import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';

export class EntityManager {
  private scene: THREE.Scene;
  
  public masterBoardGroup: THREE.Group;
  private playerBoardGroup: THREE.Group;
  private enemyBoardGroup: THREE.Group;
  
  private targetRotationX: number = 0;
  private flipSpeed: number = 0.05;
  
  private lastAttackMarker: THREE.Mesh | null = null;
  private fallingMarkers: { mesh: THREE.Mesh, targetY: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    this.masterBoardGroup = new THREE.Group();
    this.playerBoardGroup = new THREE.Group();
    this.enemyBoardGroup = new THREE.Group();
    
    // Position faces: Player points UP, Enemy points DOWN
    this.playerBoardGroup.position.y = 0.3; 
    
    this.enemyBoardGroup.position.y = -0.3;
    this.enemyBoardGroup.rotation.x = Math.PI; // Flipped upside down
    
    this.masterBoardGroup.add(this.playerBoardGroup);
    this.masterBoardGroup.add(this.enemyBoardGroup);
    this.scene.add(this.masterBoardGroup);

    this.createBoardMeshes();

    // Listen to settings changes for flip speed
    document.addEventListener('SET_FLIP_SPEED', (e: any) => {
        if (e.detail?.speed !== undefined) {
            this.flipSpeed = parseFloat(e.detail.speed);
        }
    });
  }

  private createBoardMeshes() {
    const boardSize = 10;
    const offset = boardSize / 2;

    // Create a large visible plane for the "water surface" underneath everything
    const waterGeometry = new THREE.PlaneGeometry(30, 30);
    const waterMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1E90FF, 
      roughness: 0.1, 
      metalness: 0.1 
    });
    const waterPlane = new THREE.Mesh(waterGeometry, waterMaterial);
    waterPlane.rotation.x = -Math.PI / 2;
    waterPlane.position.y = -1.0; // Deep below the board
    waterPlane.receiveShadow = true;
    this.scene.add(waterPlane);

    // Create the "Master Wood Board"
    const woodGeo = new THREE.BoxGeometry(10.5, 0.6, 10.5);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    const woodBlock = new THREE.Mesh(woodGeo, woodMat);
    woodBlock.castShadow = true;
    woodBlock.receiveShadow = true;
    this.masterBoardGroup.add(woodBlock);

    // Create interactable grid tiles (invisible or somewhat transparent borders)
    const tileGeometry = new THREE.BoxGeometry(0.95, 0.1, 0.95);
    const tilePlayerMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, transparent: true, opacity: 0.2, depthWrite: false });
    const tileEnemyMat = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.2, depthWrite: false });

    for (let x = 0; x < boardSize; x++) {
      for (let z = 0; z < boardSize; z++) {
        const worldX = x - offset + 0.5;
        const worldZ = z - offset + 0.5;
        
        // Player Side tile
        const ptile = new THREE.Mesh(tileGeometry, tilePlayerMat);
        ptile.position.set(worldX, 0, worldZ);
        ptile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: true };
        this.playerBoardGroup.add(ptile);

        // Enemy Side tile
        const etile = new THREE.Mesh(tileGeometry, tileEnemyMat);
        etile.position.set(worldX, 0, worldZ);
        etile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: false };
        this.enemyBoardGroup.add(etile);
      }
    }
    
    // GridHelpers for visual debug
    const pGrid = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
    pGrid.position.y = 0.05;
    pGrid.material.transparent = true; pGrid.material.opacity = 0.5;
    this.playerBoardGroup.add(pGrid);

    const eGrid = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
    eGrid.position.y = 0.05;
    eGrid.material.transparent = true; eGrid.material.opacity = 0.5;
    this.enemyBoardGroup.add(eGrid);
  }

  /**
   * Returns the list of objects that the Raycaster should test against.
   * Only returns the tiles that are currently facing UP.
   */
  public getInteractableObjects(): THREE.Object3D[] {
    // Determine which side is facing up by looking at rotation
    // Math.PI rotation means enemy board is UP
    const isEnemyUp = Math.abs(this.masterBoardGroup.rotation.x - Math.PI) < 0.1;
    if (isEnemyUp) {
        return this.enemyBoardGroup.children.filter(c => c.userData.isGridTile);
    }
    return this.playerBoardGroup.children.filter(c => c.userData.isGridTile);
  }

  public showPlayerBoard() {
    this.targetRotationX = 0;
  }

  public showEnemyBoard() {
    this.targetRotationX = Math.PI;
  }

  public update() {
      // Smoothly lerp board rotation
      this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * this.flipSpeed;
      
      // Animate falling markers
      for (let i = this.fallingMarkers.length - 1; i >= 0; i--) {
          const m = this.fallingMarkers[i];
          m.mesh.position.y += (m.targetY - m.mesh.position.y) * 0.15;
          if (Math.abs(m.mesh.position.y - m.targetY) < 0.01) {
              m.mesh.position.y = m.targetY;
              this.fallingMarkers.splice(i, 1);
          }
      }
  }

  public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
    if (!isPlayer) return; // Hide enemy ships

    const targetGroup = this.playerBoardGroup; // Player ships go on player board

    const shipMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.7,
    });

    for (let i = 0; i < ship.size; i++) {
      const cx = orientation === Orientation.Horizontal ? x + i : x;
      const cz = orientation === Orientation.Vertical ? z + i : z;
      
      const boxG = new THREE.BoxGeometry(0.8, 0.4, 0.8);
      const block = new THREE.Mesh(boxG, shipMaterial);
      
      const worldX = cx - 5 + 0.5;
      const worldZ = cz - 5 + 0.5;
      
      block.position.set(worldX, 0.2, worldZ);
      block.castShadow = true;
      block.receiveShadow = true;
      targetGroup.add(block);
    }
  }

  public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean) {
    // If the player fired the shot, it lands on the enemy board. If the enemy fired, it lands on the player board.
    const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

    // Revert previous last attack marker to its original color
    if (this.lastAttackMarker) {
        const originalMat = this.lastAttackMarker.userData.originalMat as THREE.MeshStandardMaterial;
        this.lastAttackMarker.material = originalMat;
    }

    let originalColor = 0xffffff; // Miss -> white
    if (result === 'hit' || result === 'sunk') {
      originalColor = 0xff0000; // Hit -> red
    }

    const originalMat = new THREE.MeshStandardMaterial({ color: originalColor, roughness: 0.5 });
    // Active yellow material
    const activeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.2, emissive: 0x888800 });

    const geo = new THREE.BoxGeometry(0.4, 0.6, 0.4);
    const marker = new THREE.Mesh(geo, activeMat);
    marker.userData = { originalMat }; // Save original material for later

    const worldX = x - 5 + 0.5;
    const worldZ = z - 5 + 0.5;
    
    // Start way up high for drop animation
    marker.position.set(worldX, 5.0, worldZ);
    targetGroup.add(marker);
    
    this.fallingMarkers.push({ mesh: marker, targetY: 0.4 });
    this.lastAttackMarker = marker;
  }
}
