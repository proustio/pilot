import * as THREE from 'three';
import { GameState } from '../../../application/game-loop/GameLoop';
import { Orientation } from '../../../domain/fleet/Ship';

export class InteractionManager {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  private camera: THREE.PerspectiveCamera;
  private entityManager: any; // We'll type this dynamically to avoid circular issues
  
  // Highlight cursor UI
  private hoverCursor: THREE.Mesh;
  public hoveredCell: { x: number, z: number } | null = null;
  
  private clickListeners: ((intersection: THREE.Intersection) => void)[] = [];
  
  public interactionEnabled: boolean = true;
  private gameLoop: any = null;
  private ghostGroup: THREE.Group;
  private currentGhostSize: number = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, entityManager: any) {
    this.camera = camera;
    this.entityManager = entityManager;
    
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    scene.add(this.ghostGroup);
    
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
    
    // Listen for interaction blocks from UI
    document.addEventListener('SET_INTERACTION_ENABLED', (e: Event) => {
        const ce = e as CustomEvent;
        if (ce.detail && ce.detail.enabled !== undefined) {
            this.interactionEnabled = ce.detail.enabled;
            if (!this.interactionEnabled) {
                this.hoverCursor.visible = false;
                this.hoveredCell = null;
            }
        }
    });
  }

  public setGameLoop(gameLoop: any) {
    this.gameLoop = gameLoop;
  }

  public onClick(listener: (intersection: THREE.Intersection) => void) {
    this.clickListeners.push(listener);
  }

  private onMouseClick(_event: MouseEvent) {
    if (!this.interactionEnabled) return;
    
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
    if (!this.interactionEnabled) return;
    
    // Normalize mouse coordinates to -1 to +1 range
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  public update() {
    if (!this.interactionEnabled) return;

    // Update raycaster with current camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Test intersections against the board tiles
    const interacts = this.entityManager.getInteractableObjects();
    const intersects = this.raycaster.intersectObjects(interacts);

    if (intersects.length > 0) {
      // Find first valid grid tile (since there may be overlaps or parent groups)
      const hit = intersects.find(i => i.object.userData.isGridTile);
      
      if (hit) {
        if (this.gameLoop && this.gameLoop.currentState === GameState.SETUP_BOARD && this.gameLoop.playerShipsToPlace.length > 0) {
            this.hoverCursor.visible = false;
            
            const ship = this.gameLoop.playerShipsToPlace[0];
            const size = ship.size;
            const orientation = this.gameLoop.currentPlacementOrientation;
            
            if (this.currentGhostSize !== size) {
                this.buildGhost(size);
                this.currentGhostSize = size;
            }
            
            const x = hit.object.userData.cellX;
            const z = hit.object.userData.cellZ;
            
            // Uses duck typing to find out if it is valid
            const isValid = this.gameLoop.match.validatePlacement(this.gameLoop.match.playerBoard, ship, x, z, orientation);
            const color = isValid ? 0x00ff00 : 0xff0000;
            
            this.ghostGroup.children.forEach((child, index) => {
                const mesh = child as THREE.Mesh;
                const mat = mesh.material as THREE.MeshBasicMaterial;
                mat.color.setHex(color);
                
                const cx = orientation === Orientation.Horizontal ? index : 0;
                const cz = orientation === Orientation.Vertical ? index : 0;
                
                mesh.position.set(cx, 0, cz);
            });
            
            this.ghostGroup.position.copy(hit.object.position);
            this.ghostGroup.position.y += 0.25; 
            this.ghostGroup.quaternion.copy(hit.object.parent!.quaternion);
            this.ghostGroup.visible = true;
            
        } else {
            this.ghostGroup.visible = false;
            // Snap cursor to tile position
            this.hoverCursor.position.copy(hit.object.position);
            this.hoverCursor.visible = true;
            
            // Ensure cursor inherits the board's rotation (UP or DOWN) by attaching to parent or copying quaternion
            this.hoverCursor.quaternion.copy(hit.object.parent!.quaternion);
        }
        
        this.hoveredCell = {
          x: hit.object.userData.cellX,
          z: hit.object.userData.cellZ
        };
        
      } else {
        this.hoverCursor.visible = false;
        this.ghostGroup.visible = false;
        this.hoveredCell = null;
      }
    } else {
      this.hoverCursor.visible = false;
      this.ghostGroup.visible = false;
      this.hoveredCell = null;
    }
  }

  private buildGhost(size: number) {
      // clear old ghost
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
}
