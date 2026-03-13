import * as THREE from 'three';
import { GameState } from '../../../application/game-loop/GameLoop';
import { Orientation } from '../../../domain/fleet/Ship';

export class InteractionManager {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private lastMouseClientX: number = 0;
  private lastMouseClientY: number = 0;

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

    // Create the visual hover cursor — glow effect that shines up from water through fog
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
        // Horizontal fade: strongest in center, fades to edges
        float hFade = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0);
        // Vertical fade: strongest at bottom (vUv.y=0), fully transparent at top (vUv.y=1)
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

    // Two crossed planes for a volumetric glow illusion
    const glowGroup = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(1.0, 2.5);
    const plane1 = new THREE.Mesh(planeGeo, glowMat);
    const plane2 = new THREE.Mesh(planeGeo, glowMat.clone());
    plane2.rotation.y = Math.PI / 2; // Perpendicular cross
    glowGroup.add(plane1);
    glowGroup.add(plane2);
    glowGroup.renderOrder = 999;

    this.hoverCursor = glowGroup as any;
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
    this.lastMouseClientX = event.clientX;
    this.lastMouseClientY = event.clientY;
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

          const ghostWorldPos = new THREE.Vector3();
          hit.object.getWorldPosition(ghostWorldPos);
          this.ghostGroup.position.copy(ghostWorldPos);
          this.ghostGroup.position.y += 0.45; // raised to match actual ships
          this.ghostGroup.quaternion.copy(hit.object.parent!.quaternion);
          this.ghostGroup.visible = true;

        } else {
          this.ghostGroup.visible = false;
          // Snap cursor to tile world position (not local) so it sits at water/ship level
          const worldPos = new THREE.Vector3();
          hit.object.getWorldPosition(worldPos);
          this.hoverCursor.position.copy(worldPos);
          this.hoverCursor.position.y += 1.25; // Shift up by half the glow plane height so bottom is at water level
          this.hoverCursor.visible = true;

          // Reset quaternion so glow always shines upward regardless of board flip
          this.hoverCursor.quaternion.identity();
        }

        this.hoveredCell = {
          x: hit.object.userData.cellX,
          z: hit.object.userData.cellZ
        };

        // Dispatch hover event for UI indicator
        document.dispatchEvent(new CustomEvent('MOUSE_CELL_HOVER', {
            detail: {
                x: this.hoveredCell.x,
                z: this.hoveredCell.z,
                clientX: this.lastMouseClientX,
                clientY: this.lastMouseClientY
            }
        }));

      } else {
        this.hoverCursor.visible = false;
        this.ghostGroup.visible = false;
        if (this.hoveredCell !== null) {
            this.hoveredCell = null;
            document.dispatchEvent(new CustomEvent('MOUSE_CELL_HOVER', { detail: null }));
        }
      }
    } else {
      this.hoverCursor.visible = false;
      this.ghostGroup.visible = false;
      if (this.hoveredCell !== null) {
          this.hoveredCell = null;
          document.dispatchEvent(new CustomEvent('MOUSE_CELL_HOVER', { detail: null }));
      }
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
