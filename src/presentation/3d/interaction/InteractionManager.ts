import * as THREE from 'three';
import { GameState } from '../../../application/game-loop/GameLoop';
import { Orientation } from '../../../domain/fleet/Ship';
import { CellState } from '../../../domain/board/Board';

export class InteractionManager {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private lastMouseClientX: number = 0;
  private lastMouseClientY: number = 0;

  private camera: THREE.PerspectiveCamera;
  private entityManager: any;

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

    this.hoverCursor = glowGroup as any;
    this.hoverCursor.visible = false;
    scene.add(this.hoverCursor);

    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('click', this.onMouseClick.bind(this));

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

  private playErrorSound() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime); // Low frequency
      oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1); // Quick drop

      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn('AudioContext not supported or blocked', e);
    }
  }

  private onMouseClick(_event: MouseEvent) {
    if (!this.interactionEnabled) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const interacts = this.entityManager.getInteractableObjects();
    const intersects = this.raycaster.intersectObjects(interacts);
    if (intersects.length > 0) {
      const hit = intersects.find((i: THREE.Intersection) => i.object.userData.isGridTile);
      if (hit) {
        const x = hit.object.userData.cellX;
        const z = hit.object.userData.cellZ;
        const isPlayerSide = hit.object.userData.isPlayerSide;

        // Check if the cell has already been shot at
        if (this.gameLoop && this.gameLoop.match && this.gameLoop.currentState === GameState.PLAYER_TURN) {
          const targetBoard = isPlayerSide ? this.gameLoop.match.playerBoard : this.gameLoop.match.enemyBoard;
          const index = z * targetBoard.width + x;
          const cellState = targetBoard.gridState[index];

          if (cellState === CellState.Hit || cellState === CellState.Miss || cellState === CellState.Sunk) {
            this.playErrorSound();
            return; // Prevent click from propagating
          }
        }

        this.clickListeners.forEach(listener => listener(hit));
      }
    }
  }

  private onMouseMove(event: MouseEvent) {
    if (!this.interactionEnabled) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.lastMouseClientX = event.clientX;
    this.lastMouseClientY = event.clientY;
  }

  public update() {
    if (!this.interactionEnabled) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const interacts = this.entityManager.getInteractableObjects();
    const intersects = this.raycaster.intersectObjects(interacts);

    if (intersects.length > 0) {
      const hit = intersects.find((i: THREE.Intersection) => i.object.userData.isGridTile);

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

          const isValid = this.gameLoop.match.validatePlacement(this.gameLoop.match.playerBoard, ship, x, z, orientation);
          const color = isValid ? 0x00ff00 : 0xff0000;

          this.ghostGroup.children.forEach((child: THREE.Object3D, index: number) => {
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
          this.ghostGroup.position.y += 0.45;
          this.ghostGroup.quaternion.copy(hit.object.parent!.quaternion);
          this.ghostGroup.visible = true;

        } else {
          this.ghostGroup.visible = false;

          let showHover = true;

          const x = hit.object.userData.cellX;
          const z = hit.object.userData.cellZ;
          const isPlayerSide = hit.object.userData.isPlayerSide;

          if (this.gameLoop && this.gameLoop.match && this.gameLoop.currentState === GameState.PLAYER_TURN) {
            const targetBoard = isPlayerSide ? this.gameLoop.match.playerBoard : this.gameLoop.match.enemyBoard;
            const index = z * targetBoard.width + x;
            const st = targetBoard.gridState[index];
            if (st === CellState.Hit || st === CellState.Miss || st === CellState.Sunk) {
              showHover = false;
            }
          }

          if (showHover) {
            const worldPos = new THREE.Vector3();
            hit.object.getWorldPosition(worldPos);
            this.hoverCursor.position.copy(worldPos);
            this.hoverCursor.position.y += 1.25;
            this.hoverCursor.visible = true;

            this.hoverCursor.quaternion.identity();
          } else {
            this.hoverCursor.visible = false;
          }
        }

        this.hoveredCell = {
          x: hit.object.userData.cellX,
          z: hit.object.userData.cellZ
        };

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
