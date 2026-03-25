import * as THREE from 'three';
import { GameState } from '../../../application/game-loop/GameLoop';
import { InteractivityGuard } from '../../InteractivityGuard';
import { Orientation } from '../../../domain/fleet/Ship';
import { MatchMode } from '../../../domain/match/Match';
import { CellState } from '../../../domain/board/Board';
import { Config } from '../../../infrastructure/config/Config';
import { RaycastService } from './RaycastService';
import { InputFeedbackHandler } from './InputFeedbackHandler';

export class InteractionManager {
  private entityManager: any;
  private gameLoop: any = null;

  private raycastService: RaycastService;
  private feedbackHandler: InputFeedbackHandler;

  private lastMouseClientX: number = 0;
  private lastMouseClientY: number = 0;

  public hoveredCell: { x: number, z: number } | null = null;
  private uiHoveredCell: { x: number, z: number, isPlayerSide: boolean } | null = null;
  public interactionEnabled: boolean = true;
  private clickListeners: ((intersection: THREE.Intersection) => void)[] = [];

  private lastMoveShipId: string | null = null;
  private lastMoveAction: string | null = null;
  private lastMovesRemaining: number = -1;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, entityManager: any) {
    this.entityManager = entityManager;

    this.raycastService = new RaycastService(camera, entityManager);
    this.feedbackHandler = new InputFeedbackHandler(scene, entityManager);

    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('click', this.onMouseClick.bind(this));

    document.addEventListener('SET_INTERACTION_ENABLED', (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail && ce.detail.enabled !== undefined) {
        this.interactionEnabled = ce.detail.enabled;
        if (!this.interactionEnabled) {
          this.feedbackHandler.hoverCursor.visible = false;
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
    if (InteractivityGuard.isBlocked() || !this.interactionEnabled || 
        (this.gameLoop && (this.gameLoop.isAnimating || this.gameLoop.currentState === GameState.GAME_OVER))) {
        return;
    }

    if (InteractivityGuard.isPointerOverUI(event.clientX, event.clientY)) return;

    const intersects = this.raycastService.getIntersections(this.entityManager.getInteractableObjects());
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
                const cellIndex = z * targetBoard.width + x;
                const cellState = targetBoard.gridState[cellIndex];

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
    this.raycastService.updateMouse(event.clientX, event.clientY);
    this.lastMouseClientX = event.clientX;
    this.lastMouseClientY = event.clientY;
  }

  public update() {
    const pickedTile = this.raycastService.getPickedTile() as THREE.Object3D;
    const isInteractionBlocked = InteractivityGuard.isBlocked() || 
                                 !this.interactionEnabled || 
                                 (this.gameLoop && (this.gameLoop.isAnimating || this.gameLoop.currentState === GameState.GAME_OVER)) ||
                                 InteractivityGuard.isPointerOverUI(this.lastMouseClientX, this.lastMouseClientY);

    if (pickedTile && !isInteractionBlocked) {
      if (this.gameLoop && this.gameLoop.currentState === GameState.SETUP_BOARD && this.gameLoop.playerShipsToPlace.length > 0) {
        this.feedbackHandler.hoverCursor.visible = false;

        const ship = this.gameLoop.playerShipsToPlace[0];
        const orientation = this.gameLoop.currentPlacementOrientation;
        const x = pickedTile.userData.cellX;
        const z = pickedTile.userData.cellZ;
        const isPlayerSide = pickedTile.userData.isPlayerSide;

        if (!Config.rogueMode && !isPlayerSide) {
           this.feedbackHandler.ghostGroup.visible = false;
        } else {
           const targetBoard = Config.rogueMode ? this.gameLoop.match.sharedBoard : this.gameLoop.match.playerBoard;
           const isValid = this.gameLoop.match.validatePlacement(targetBoard, ship, x, z, orientation);
           this.feedbackHandler.updateGhost(ship, orientation, pickedTile, isValid);
        }

      } else {
        this.feedbackHandler.ghostGroup.visible = false;

        let showHover = true;
        const x = pickedTile.userData.cellX;
        const z = pickedTile.userData.cellZ;
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
          let scaleX = 1, scaleZ = 1;
          const weapon = (window as any).selectedRogueWeapon;
          if (Config.rogueMode && weapon === 'airstrike') {
            const isVertical = this.gameLoop.airStrikeOrientation === Orientation.Vertical;
            if (isVertical) scaleZ = 10; else scaleX = 10;
          }
          this.feedbackHandler.updateHoverCursor(pickedTile, scaleX, scaleZ);
        } else {
          this.feedbackHandler.hoverCursor.visible = false;
        }
        this.uiHoveredCell = null;
      }

      this.hoveredCell = { x: pickedTile.userData.cellX, z: pickedTile.userData.cellZ };

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
      this.feedbackHandler.ghostGroup.visible = false;
      this.feedbackHandler.hoverCursor.visible = false;
      this.hoveredCell = null;
      
      if (this.uiHoveredCell === null) {
          document.dispatchEvent(new CustomEvent('MOUSE_CELL_HOVER', { detail: null }));
      }
      
      if (this.uiHoveredCell && !isInteractionBlocked) {
        const { x, z, isPlayerSide } = this.uiHoveredCell;
        const tiles = isPlayerSide ? this.entityManager.playerGridTiles : this.entityManager.enemyGridTiles;
        const boardWidth = Config.board.width;
        const tileIndex = z * boardWidth + x;
        const tile = tiles[tileIndex];

        if (tile) {
          this.feedbackHandler.updateHoverCursorFromUI(tile);
        } else {
          this.feedbackHandler.hoverCursor.visible = false;
        }
      } else {
        this.feedbackHandler.hoverCursor.visible = false;
      }
    }

    this.updateMoveHighlight();
    this.updateHoverState();
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
}
