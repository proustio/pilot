import * as THREE from 'three';
import { GameState } from '../../../application/game-loop/GameLoop';
import { InteractivityGuard } from '../../InteractivityGuard';
import { Orientation } from '../../../domain/fleet/Ship';
import { MatchMode } from '../../../domain/match/Match';
import { CellState } from '../../../domain/board/Board';
import { Config } from '../../../infrastructure/config/Config';

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
  private uiHoveredCell: { x: number, z: number, isPlayerSide: boolean } | null = null;
  private moveHighlightGroup: THREE.Group;
  
  private lastMoveShipId: string | null = null;
  private lastMoveAction: string | null = null;
  private lastMovesRemaining: number = -1;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, entityManager: any) {
    this.camera = camera;
    this.entityManager = entityManager;

    this.ghostGroup = new THREE.Group();
    this.ghostGroup.renderOrder = 999;
    this.ghostGroup.visible = false;
    scene.add(this.ghostGroup);

    this.moveHighlightGroup = new THREE.Group();
    this.moveHighlightGroup.renderOrder = 998;
    this.moveHighlightGroup.visible = false;
    // Add to the appropriate board group. In Rogue mode, the battlefield is the player board (non-flipped).
    const highlightParent = Config.rogueMode ? entityManager.playerBoardGroup : entityManager.playerBoardGroup;
    highlightParent.add(this.moveHighlightGroup);

    // Glowing Highlight Shader for Hover Cursor
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

    document.addEventListener('MOUSE_CELL_HOVER', (e: Event) => {
      const ce = e as CustomEvent;
      if (!ce.detail || ce.detail.source === '3d') {
        if (ce.detail === null) {
            this.uiHoveredCell = null;
        }
        return;
      }
      this.uiHoveredCell = { x: ce.detail.x, z: ce.detail.z, isPlayerSide: ce.detail.isPlayerSide };
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

  private onMouseClick(event: MouseEvent) {
    if (InteractivityGuard.isBlocked() || !this.interactionEnabled || (this.gameLoop && (this.gameLoop.isAnimating || this.gameLoop.currentState === GameState.GAME_OVER))) return;

        // Block if clicking over HUD/UI
        if (InteractivityGuard.isPointerOverUI(event.clientX, event.clientY)) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const interacts = this.entityManager.getInteractableObjects();
        const intersects = this.raycaster.intersectObjects(interacts);
        if (intersects.length > 0) {
            const hit = intersects.find((i: THREE.Intersection) => i.object.userData.isGridTile);
            if (hit) {
                const x = hit.object.userData.cellX;
                const z = hit.object.userData.cellZ;
                const isPlayerSide = hit.object.userData.isPlayerSide;

                if (this.gameLoop && this.gameLoop.match && this.gameLoop.currentState === GameState.PLAYER_TURN) {
                    const isRogue = this.gameLoop.match.mode === MatchMode.Rogue;
                    const action = (window as any).selectedRogueAction || 'move';
                    
                    if (isRogue && action === 'move') {
                        const order = this.gameLoop.rogueShipOrder;
                        const index = this.gameLoop.activeRogueShipIndex;
                        const activeShip = order && index >= 0 && index < order.length ? order[index] : null;

                        if (activeShip) {
                            const dx = Math.abs(x - activeShip.headX);
                            const dz = Math.abs(z - activeShip.headZ);
                            if (dx + dz === 0 || dx + dz > activeShip.movesRemaining) {
                                this.playErrorSound();
                                return;
                            }
                        }
                    }

                    const targetBoard = isRogue ? this.gameLoop.match.sharedBoard : (isPlayerSide ? this.gameLoop.match.playerBoard : this.gameLoop.match.enemyBoard);
                    const index = z * targetBoard.width + x;
                    const cellState = targetBoard.gridState[index];

                    if (cellState === CellState.Hit || cellState === CellState.Miss || cellState === CellState.Sunk) {
                        this.playErrorSound();
                        return;
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
    let pickedTile: THREE.Object3D | null = null;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const interacts = this.entityManager.getInteractableObjects();
    const intersects = this.raycaster.intersectObjects(interacts);

    if (intersects.length > 0) {
      const hit = intersects.find((i: THREE.Intersection) => i.object.userData.isGridTile);
      if (hit) pickedTile = hit.object;
    }

    const isInteractionBlocked = InteractivityGuard.isBlocked() || 
                                 !this.interactionEnabled || 
                                 (this.gameLoop && (this.gameLoop.isAnimating || this.gameLoop.currentState === GameState.GAME_OVER)) ||
                                 InteractivityGuard.isPointerOverUI(this.lastMouseClientX, this.lastMouseClientY);


    if (pickedTile && !isInteractionBlocked) {
      if (this.gameLoop && this.gameLoop.currentState === GameState.SETUP_BOARD && this.gameLoop.playerShipsToPlace.length > 0) {
        this.hoverCursor.visible = false;

        const ship = this.gameLoop.playerShipsToPlace[0];
        const size = ship.size;
        const orientation = this.gameLoop.currentPlacementOrientation;

        if (this.currentGhostSize !== size) {
          this.buildGhost(size);
          this.currentGhostSize = size;
        }

        const x = pickedTile.userData.cellX;
        const z = pickedTile.userData.cellZ;
        const isPlayerSide = pickedTile.userData.isPlayerSide;

        // Block preview on enemy side in Classic mode
        if (!Config.rogueMode && !isPlayerSide) {
           this.ghostGroup.visible = false;
           return;
        }

        const targetBoard = Config.rogueMode ? this.gameLoop.match.sharedBoard : this.gameLoop.match.playerBoard;
        const isValid = this.gameLoop.match.validatePlacement(targetBoard, ship, x, z, orientation);
        const color = isValid ? 0x00ff00 : 0xff0000;

        this.ghostGroup.children.forEach((child: THREE.Object3D, index: number) => {
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.color.setHex(color);

          let cx = 0;
          let cz = 0;
          if (orientation === Orientation.Horizontal) cx = index;
          else if (orientation === Orientation.Vertical) cz = index;
          else if (orientation === Orientation.Left) cx = -index;
          else if (orientation === Orientation.Up) cz = -index;

          mesh.position.set(cx, 0, cz);
        });

        const ghostWorldPos = new THREE.Vector3();
        pickedTile.getWorldPosition(ghostWorldPos);
        this.ghostGroup.position.copy(ghostWorldPos);
        this.ghostGroup.position.y += 0.45;
        this.ghostGroup.quaternion.copy(pickedTile.parent!.quaternion);
        this.ghostGroup.visible = true;

      } else {
        this.ghostGroup.visible = false;

        let showHover = true;
        const x = pickedTile.userData.cellX;
        const z = pickedTile.userData.cellZ;
        const isPlayerSide = pickedTile.userData.isPlayerSide;

        if (this.gameLoop && this.gameLoop.match && this.gameLoop.currentState === GameState.PLAYER_TURN) {
          const isRogue = this.gameLoop.match.mode === MatchMode.Rogue;
          const targetBoard = isRogue ? this.gameLoop.match.sharedBoard : (isPlayerSide ? this.gameLoop.match.playerBoard : this.gameLoop.match.enemyBoard);
          const index = z * targetBoard.width + x;
          const st = targetBoard.gridState[index];
          if (st === CellState.Hit || st === CellState.Miss || st === CellState.Sunk) {
            showHover = false;
          }
        }

        if (showHover) {
          const worldPos = new THREE.Vector3();
          pickedTile.getWorldPosition(worldPos);
          this.hoverCursor.position.copy(worldPos);
          this.hoverCursor.position.y += 1.25;
          this.hoverCursor.visible = true;
          this.hoverCursor.quaternion.identity();

          // Scale hover cursor for Air Strike (show a line)
          const weapon = (window as any).selectedRogueWeapon;
          if (Config.rogueMode && weapon === 'airstrike') {
            const isVertical = this.gameLoop.airStrikeOrientation === Orientation.Vertical;
            if (isVertical) {
                this.hoverCursor.scale.set(1, 1, 10);
            } else {
                this.hoverCursor.scale.set(10, 1, 1);
            }
          } else {
            this.hoverCursor.scale.set(1, 1, 1);
          }
        } else {
          this.hoverCursor.visible = false;
        }
        this.uiHoveredCell = null; // 3D hover takes priority
      }

      this.hoveredCell = {
        x: pickedTile.userData.cellX,
        z: pickedTile.userData.cellZ
      };

      document.dispatchEvent(new CustomEvent('MOUSE_CELL_HOVER', {
          detail: {
              x: this.hoveredCell.x,
              z: this.hoveredCell.z,
              isPlayerSide: pickedTile.userData.isPlayerSide,
              source: '3d',
              clientX: this.lastMouseClientX,
              clientY: this.lastMouseClientY
          }
      }));

    } else {
      this.ghostGroup.visible = false;
      this.hoverCursor.visible = false;
      this.hoveredCell = null;
      if (this.uiHoveredCell === null) {
          document.dispatchEvent(new CustomEvent('MOUSE_CELL_HOVER', { detail: null }));
      }
      
      // Check if there's a UI hover to display instead
      if (this.uiHoveredCell) {
        const { x, z, isPlayerSide } = this.uiHoveredCell;
        const tiles = isPlayerSide ? this.entityManager.playerGridTiles : this.entityManager.enemyGridTiles;
        const boardWidth = Config.board.width;
        const tileIndex = z * boardWidth + x;
        const tile = tiles[tileIndex];

        if (tile) {
          const localOffset = new THREE.Vector3(0, 1.25, 0);
          const worldPos = tile.localToWorld(localOffset);
          this.hoverCursor.position.copy(worldPos);
          
          // Align cursor with the board's orientation (upright or flipped)
          const boardQuat = new THREE.Quaternion();
          tile.getWorldQuaternion(boardQuat);
          this.hoverCursor.quaternion.copy(boardQuat);
          
          this.hoverCursor.visible = true;
        } else {
          this.hoverCursor.visible = false;
        }
      } else {
        this.hoverCursor.visible = false;
      }
    }

    this.updateMoveHighlight();
    this.updateHoverState();
  }

  private updateHoverState() {
    // We want to report it even if blocked for clicking, because the camera guard needs it.
    (window as any).isHoveringBattlefield = this.hoveredCell !== null;
  }

  private updateMoveHighlight() {
      if (!this.gameLoop || this.gameLoop.currentState !== GameState.PLAYER_TURN || !this.gameLoop.match || this.gameLoop.match.mode !== MatchMode.Rogue) {
          this.moveHighlightGroup.visible = false;
          return;
      }
      const action = (window as any).selectedRogueAction || 'move';
      if (action !== 'move') {
          this.moveHighlightGroup.visible = false;
          this.lastMoveAction = action;
          return;
      }

      const order = this.gameLoop.rogueShipOrder;
      const index = this.gameLoop.activeRogueShipIndex;
      const activeShip = order && index >= 0 && index < order.length ? order[index] : null;
      
      if (!activeShip || activeShip.hasActedThisTurn || activeShip.movesRemaining <= 0) {
          this.moveHighlightGroup.visible = false;
          return;
      }

      this.moveHighlightGroup.visible = true;

      if (this.lastMoveShipId !== activeShip.id || this.lastMoveAction !== action || this.lastMovesRemaining !== activeShip.movesRemaining) {
          this.rebuildMoveHighlight(activeShip, this.gameLoop.match.sharedBoard);
          this.lastMoveShipId = activeShip.id;
          this.lastMoveAction = action;
          this.lastMovesRemaining = activeShip.movesRemaining;
      }
  }

  private rebuildMoveHighlight(ship: any, board: any) {
      this.moveHighlightGroup.clear();
      
      const mat = new THREE.MeshBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false
      });
      const geo = new THREE.PlaneGeometry(0.9, 0.9);
      
      const boardOffset = Config.board.width / 2;
      const moves = ship.movesRemaining;
      
      for (let x = 0; x < board.width; x++) {
          for (let z = 0; z < board.height; z++) {
              const dx = Math.abs(x - ship.headX);
              const dz = Math.abs(z - ship.headZ);
              if (dx + dz > 0 && dx + dz <= moves) { 
                  const targetX = x - boardOffset + 0.5;
                  const targetZ = z - boardOffset + 0.5;
                  const mesh = new THREE.Mesh(geo, mat);
                  mesh.rotation.x = -Math.PI / 2;
                  mesh.position.set(targetX, 0.2, targetZ);
                  mesh.renderOrder = 999;
                  this.moveHighlightGroup.add(mesh);
              }
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
