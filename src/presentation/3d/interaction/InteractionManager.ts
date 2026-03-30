import * as THREE from 'three';
import { GameState } from '../../../application/game-loop/GameLoop';
import { InteractivityGuard } from '../../InteractivityGuard';
import { Orientation } from '../../../domain/fleet/Ship';
import { MatchMode } from '../../../domain/match/Match';
import { CellState } from '../../../domain/board/Board';
import { Config } from '../../../infrastructure/config/Config';
import { eventBus, GameEventType } from '../../../application/events/GameEventBus';
import { RaycastService } from './RaycastService';
import { InputFeedbackHandler } from './InputFeedbackHandler';

export class InteractionManager {
  private entityManager: any;
  private gameLoop: any = null;

  private raycastService: RaycastService;
  private feedbackHandler: InputFeedbackHandler;

  private lastMouseClientX: number = 0;
  private lastMouseClientY: number = 0;
  private isShiftDown: boolean = false;

  public hoveredCell: { x: number, z: number } | null = null;
  private uiHoveredCell: { x: number, z: number, isPlayerSide: boolean } | null = null;
  public interactionEnabled: boolean = true;
  private clickListeners: ((x: number, z: number, isPlayerSide: boolean) => void)[] = [];

  private lastMoveShipId: string | null = null;
  private lastMoveShipX: number = -1;
  private lastMoveShipZ: number = -1;
  private lastMoveAction: string | null = null;
  private lastMovesRemaining: number = -1;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, entityManager: any) {
    this.entityManager = entityManager;

    this.raycastService = new RaycastService(camera, entityManager);
    this.feedbackHandler = new InputFeedbackHandler(scene, entityManager);

    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('click', this.onMouseClick.bind(this));
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.isShiftDown = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.isShiftDown = false; });
    
    this.setupGlobalListeners();
  }

  private setupGlobalListeners() {
    eventBus.on(GameEventType.SET_INTERACTION_ENABLED, (payload) => {
        this.interactionEnabled = payload.enabled;
        if (!this.interactionEnabled) {
            this.feedbackHandler.hoverCursor.visible = false;
            this.hoveredCell = null;
        }
    });

    eventBus.on(GameEventType.SET_ROGUE_WEAPON, (payload) => {
      (window as any).selectedRogueWeapon = payload.weapon;
    });

    eventBus.on(GameEventType.SET_ROGUE_ACTION_SECTION, (payload) => {
      (window as any).selectedRogueAction = payload.section;
    });

    eventBus.on(GameEventType.MOUSE_CELL_HOVER, (payload) => {
      if (!payload || payload.source === '3d') {
        if (payload === null) {
            this.uiHoveredCell = null;
        }
        return;
      }
      this.uiHoveredCell = { x: payload.x, z: payload.z, isPlayerSide: payload.isPlayerSide };
    });
  }

  private handleCellLeave() {
    this.feedbackHandler.hoverCursor.visible = false;
    if (!this.uiHoveredCell) {
        eventBus.emit(GameEventType.MOUSE_CELL_HOVER, null);
    }
  }

  public setGameLoop(gameLoop: any) {
    this.gameLoop = gameLoop;
  }

  public onClick(listener: (x: number, z: number, isPlayerSide: boolean) => void) {
    this.clickListeners.push(listener);
  }

  private playErrorSound() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);

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
    if (event.shiftKey) return;

    if (InteractivityGuard.isBlocked() || !this.interactionEnabled || 
        (this.gameLoop && (this.gameLoop.isAnimating || this.gameLoop.currentState === GameState.GAME_OVER))) {
        return;
    }

    if (InteractivityGuard.isPointerOverUI(event.clientX, event.clientY)) return;

    const intersects = this.raycastService.getIntersections(this.entityManager.getInteractableObjects());
    if (intersects.length > 0) {
        const hit = intersects.find((i: THREE.Intersection) => i.object.userData.isGridTile || i.object.userData.isInstancedGrid || i.object.userData.isRaycastPlane);
        if (hit) {
            let x, z;
            if (hit.object.userData.isRaycastPlane) {
                const localPoint = hit.object.worldToLocal(hit.point.clone());
                x = Math.floor(localPoint.x + Config.board.width / 2);
                z = Math.floor(localPoint.z + Config.board.width / 2);
                // Clamp coordinates
                x = Math.max(0, Math.min(Config.board.width - 1, x));
                z = Math.max(0, Math.min(Config.board.width - 1, z));
            } else {
                const isInstanced = hit.object.userData.isInstancedGrid;
                x = isInstanced && hit.instanceId !== undefined ? hit.instanceId % Config.board.width : hit.object.userData.cellX;
                z = isInstanced && hit.instanceId !== undefined ? Math.floor(hit.instanceId / Config.board.width) : hit.object.userData.cellZ;
            }
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
                const cellIndex = z * targetBoard.width + x;
                const cellState = targetBoard.gridState[cellIndex];

                if (cellState === CellState.Hit || cellState === CellState.Miss || cellState === CellState.Sunk) {
                    this.playErrorSound();
                    return;
                }
            }

            this.clickListeners.forEach(listener => listener(x as number, z as number, isPlayerSide));
        }
    }
  }

  private onMouseMove(event: MouseEvent) {
    this.isShiftDown = event.shiftKey;
    if (!this.interactionEnabled) return;
    this.raycastService.updateMouse(event.clientX, event.clientY);
    this.lastMouseClientX = event.clientX;
    this.lastMouseClientY = event.clientY;
  }

  public update() {
    this.feedbackHandler.update(performance.now());
    
    // getPickedTile now returns the full Intersection object instead of just the Object3D
    const pickedIntersection = this.raycastService.getPickedIntersection();
    const pickedTile = pickedIntersection ? pickedIntersection.object : null;
    
    // Core game state blocks (animations, menus, game over)
    const isStateBlocked = InteractivityGuard.isBlocked() || 
                           !this.interactionEnabled || 
                           this.isShiftDown ||
                           (this.gameLoop && (this.gameLoop.isAnimating || this.gameLoop.currentState === GameState.GAME_OVER));
    
    // Physical pointer blocks (e.g. mouse is over a UI panel)
    const isPointerOverUI = InteractivityGuard.isPointerOverUI(this.lastMouseClientX, this.lastMouseClientY);
    
    // We block 3D-initiated hover/clicks if the pointer is over UI or if game state is blocked
    const isInteractionBlocked = isStateBlocked || isPointerOverUI;

    if (pickedTile && pickedIntersection && !isInteractionBlocked) {
      let hoverX, hoverZ;
      if (pickedTile.userData.isRaycastPlane) {
          const localPoint = pickedTile.worldToLocal(pickedIntersection.point.clone());
          hoverX = Math.floor(localPoint.x + Config.board.width / 2);
          hoverZ = Math.floor(localPoint.z + Config.board.width / 2);
          hoverX = Math.max(0, Math.min(Config.board.width - 1, hoverX));
          hoverZ = Math.max(0, Math.min(Config.board.width - 1, hoverZ));
      } else {
          const isInstanced = pickedTile.userData.isInstancedGrid;
          hoverX = isInstanced && pickedIntersection.instanceId !== undefined ? pickedIntersection.instanceId % Config.board.width : pickedTile.userData.cellX;
          hoverZ = isInstanced && pickedIntersection.instanceId !== undefined ? Math.floor(pickedIntersection.instanceId / Config.board.width) : pickedTile.userData.cellZ;
      }

      if (this.gameLoop && this.gameLoop.currentState === GameState.SETUP_BOARD && this.gameLoop.playerShipsToPlace.length > 0) {
        this.feedbackHandler.hoverCursor.visible = false;

        const ship = this.gameLoop.playerShipsToPlace[0];
        const orientation = this.gameLoop.currentPlacementOrientation;
        const x = hoverX;
        const z = hoverZ;
        const isPlayerSide = pickedTile.userData.isPlayerSide;

        if (!Config.rogueMode && !isPlayerSide) {
           this.feedbackHandler.ghostGroup.visible = false;
        } else {
           const targetBoard = Config.rogueMode ? this.gameLoop.match.sharedBoard : this.gameLoop.match.playerBoard;
           const isValid = this.gameLoop.match.validatePlacement(targetBoard, ship, x, z, orientation);
           this.feedbackHandler.updateGhost(ship, orientation, pickedTile, isValid, x, z);
        }

      } else {
        this.feedbackHandler.ghostGroup.visible = false;

        let showHover = true;
        const x = hoverX;
        const z = hoverZ;
        const isPlayerSide = pickedTile.userData.isPlayerSide;

        if (this.gameLoop && this.gameLoop.match && this.gameLoop.currentState === GameState.PLAYER_TURN) {
          const isRogue = this.gameLoop.match.mode === MatchMode.Rogue;
          const targetBoard = isRogue ? this.gameLoop.match.sharedBoard : (isPlayerSide ? this.gameLoop.match.playerBoard : this.gameLoop.match.enemyBoard);
          const cellIndex = z * targetBoard.width + x;
          const st = targetBoard.gridState[cellIndex];
          if (st === CellState.Hit || st === CellState.Miss || st === CellState.Sunk) {
            showHover = false;
          }
        }

        if (showHover) {
          const { scaleX, scaleZ } = this.calculateHoverScale();
          // Provide dummy tile object containing position for HoverCursor positioning
          const localOffset = new THREE.Vector3(x - Config.board.width/2 + 0.5, 0, z - Config.board.width/2 + 0.5);
          
          if (pickedTile.userData.isRaycastPlane) {
              // But board itself might flip. Easiest is to add localOffset to the boardGroup's world matrix.
              const boardGrp = pickedTile.parent || pickedTile;
              boardGrp.localToWorld(localOffset);
              const worldPos = localOffset.clone();
              
              this.feedbackHandler.hoverCursor.position.copy(worldPos);
              this.feedbackHandler.hoverCursor.visible = true;
              this.feedbackHandler.hoverCursor.quaternion.identity();
              this.feedbackHandler.hoverCursor.scale.set(scaleX, 1, scaleZ);
          } else if (pickedTile.userData.isInstancedGrid) {
             pickedTile.localToWorld(localOffset);
             const worldPos = localOffset.clone();
             this.feedbackHandler.hoverCursor.position.copy(worldPos);
             this.feedbackHandler.hoverCursor.position.y += 1.25;
             this.feedbackHandler.hoverCursor.visible = true;
             this.feedbackHandler.hoverCursor.quaternion.identity();
             this.feedbackHandler.hoverCursor.scale.set(scaleX, 1, scaleZ);
          } else {
             this.feedbackHandler.updateHoverCursor(pickedTile, scaleX, scaleZ);
          }
          
        } else {
          this.feedbackHandler.hoverCursor.visible = false;
        }
        this.uiHoveredCell = null;
      }

      this.hoveredCell = { x: hoverX, z: hoverZ };

      // Notify UI about hover
      eventBus.emit(GameEventType.MOUSE_CELL_HOVER, {
          x: this.hoveredCell.x,
          z: this.hoveredCell.z,
          isPlayerSide: pickedTile.userData.isPlayerSide,
          source: '3d',
          clientX: this.lastMouseClientX,
          clientY: this.lastMouseClientY
      });

    } else {
      this.feedbackHandler.ghostGroup.visible = false;
      this.feedbackHandler.hoverCursor.visible = false;
      this.hoveredCell = null;
      
      this.handleCellLeave();
      
      if (this.uiHoveredCell && !isStateBlocked) {
        const { x, z } = this.uiHoveredCell;
        
        const { scaleX, scaleZ } = this.calculateHoverScale();
        const worldPos = new THREE.Vector3(x - Config.board.width/2 + 0.5, 1.25, z - Config.board.width/2 + 0.5);
        this.feedbackHandler.hoverCursor.position.copy(worldPos);
        this.feedbackHandler.hoverCursor.visible = true;
        this.feedbackHandler.hoverCursor.quaternion.identity();
        this.feedbackHandler.hoverCursor.scale.set(scaleX, 1, scaleZ);
      } else {
        this.feedbackHandler.hoverCursor.visible = false;
      }
    }

    this.updateMoveHighlight();
    this.updateRangeHighlights();
    this.updateHoverState();
  }

  private calculateHoverScale(): { scaleX: number, scaleZ: number } {
    let scaleX = 1, scaleZ = 1;
    if (Config.rogueMode) {
      const weapon = (window as any).selectedRogueWeapon;
      if (weapon === 'airstrike' || (weapon as any) === 'air-strike') {
        const isVertical = this.gameLoop.airStrikeOrientation === Orientation.Vertical;
        if (isVertical) scaleZ = 10; else scaleX = 10;
      }
    }
    return { scaleX, scaleZ };
  }

  private updateHoverState() {
    (window as any).isHoveringBattlefield = this.hoveredCell !== null;
  }

  private updateMoveHighlight() {
      if (!this.gameLoop || this.gameLoop.currentState !== GameState.PLAYER_TURN || !this.gameLoop.match || this.gameLoop.match.mode !== MatchMode.Rogue) {
          this.feedbackHandler.moveHighlightGroup.visible = false;
          return;
      }
      const action = (window as any).selectedRogueAction || 'move';
      if (action !== 'move') {
          this.feedbackHandler.moveHighlightGroup.visible = false;
          this.lastMoveAction = action;
          return;
      }

      const order = this.gameLoop.rogueShipOrder;
      const index = this.gameLoop.activeRogueShipIndex;
      const activeShip = order && index >= 0 && index < order.length ? order[index] : null;
      
      if (!activeShip || activeShip.hasActedThisTurn || activeShip.movesRemaining <= 0) {
          this.feedbackHandler.moveHighlightGroup.visible = false;
          return;
      }

      this.feedbackHandler.moveHighlightGroup.visible = true;

      if (this.lastMoveShipId !== activeShip.id || this.lastMoveAction !== action || this.lastMovesRemaining !== activeShip.movesRemaining) {
          this.feedbackHandler.rebuildMoveHighlight(activeShip, this.gameLoop.match.sharedBoard);
          this.lastMoveShipId = activeShip.id;
          this.lastMoveAction = action;
          this.lastMovesRemaining = activeShip.movesRemaining;
      }
  }
  private updateRangeHighlights() {
      if (!this.gameLoop || !this.gameLoop.match || this.gameLoop.match.mode !== MatchMode.Rogue) {
          this.feedbackHandler.visionHighlightGroup.visible = false;
          this.feedbackHandler.attackHighlightGroup.visible = false;
          return;
      }

      const order = this.gameLoop.rogueShipOrder;
      const index = this.gameLoop.activeRogueShipIndex;
      const activeShip = order && index >= 0 && index < order.length ? order[index] : null;

      if (!activeShip || this.gameLoop.currentState !== GameState.PLAYER_TURN) {
          this.feedbackHandler.visionHighlightGroup.visible = false;
          this.feedbackHandler.attackHighlightGroup.visible = false;
          return;
      }

      this.feedbackHandler.visionHighlightGroup.visible = true;
      this.feedbackHandler.attackHighlightGroup.visible = true;

      if (this.lastMoveShipId !== activeShip.id || this.lastMoveShipX !== activeShip.headX || this.lastMoveShipZ !== activeShip.headZ) {
          this.feedbackHandler.rebuildRangeHighlights(activeShip, this.gameLoop.match.sharedBoard);
          this.lastMoveShipId = activeShip.id;
          this.lastMoveShipX = activeShip.headX;
          this.lastMoveShipZ = activeShip.headZ;
      }
  }
}
