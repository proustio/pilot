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
import { ClickHandler } from './ClickHandler';
import { InteractionStateTracker } from './InteractionStateTracker';

export class InteractionManager {
  private gameLoop: any = null;

  private raycastService: RaycastService;
  private feedbackHandler: InputFeedbackHandler;
  private clickHandler: ClickHandler;
  private stateTracker: InteractionStateTracker;

  private lastMouseClientX: number = 0;
  private lastMouseClientY: number = 0;
  private isShiftDown: boolean = false;

  public hoveredCell: { x: number, z: number } | null = null;
  private lastEmittedCell: { x: number, z: number, isPlayerSide: boolean } | null = null;
  private uiHoveredCell: { x: number, z: number, isPlayerSide: boolean } | null = null;
  public interactionEnabled: boolean = true;



  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, entityManager: any) {
    this.raycastService = new RaycastService(camera, entityManager);
    this.feedbackHandler = new InputFeedbackHandler(scene, entityManager);
    this.clickHandler = new ClickHandler(this.raycastService, entityManager);
    this.stateTracker = new InteractionStateTracker();

    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.isShiftDown = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.isShiftDown = false; });

    this.setupGlobalListeners();
  }

  private setupGlobalListeners() {
    eventBus.on(GameEventType.SET_INTERACTION_ENABLED, (payload) => {
      this.interactionEnabled = payload.enabled;
      console.log(`[${new Date().toISOString()}] InteractionManager: Interaction enabled:`, this.interactionEnabled);
      this.clickHandler.setInteractionEnabled(payload.enabled);
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
      if (this.lastEmittedCell !== null) {
        eventBus.emit(GameEventType.MOUSE_CELL_HOVER, null);
        this.lastEmittedCell = null;
      }
    }
  }

  public setGameLoop(gameLoop: any) {
    this.gameLoop = gameLoop;
    this.clickHandler.setGameLoop(gameLoop);
  }

  public onClick(listener: (x: number, z: number, isPlayerSide: boolean) => void) {
    this.clickHandler.onClick(listener);
  }

  private onMouseMove(event: MouseEvent) {
    this.isShiftDown = event.shiftKey;
    if (!this.interactionEnabled) return;
    
    this.raycastService.updateMouse(event.clientX, event.clientY);
    this.lastMouseClientX = event.clientX;
    this.lastMouseClientY = event.clientY;
  }

  public update() {
    const now = performance.now();
    const gameState = this.gameLoop ? this.gameLoop.currentState : 'unknown';
    const orientation = this.gameLoop ? this.gameLoop.currentPlacementOrientation : null;
    const activeShip = (this.gameLoop && this.gameLoop.playerShipsToPlace.length > 0) ? this.gameLoop.playerShipsToPlace[0] : null;
    const shipId = activeShip ? activeShip.id : null;

    const isStateBlocked = InteractivityGuard.isBlocked() ||
      !this.interactionEnabled ||
      this.isShiftDown ||
      (this.gameLoop && (this.gameLoop.isAnimating || gameState === GameState.GAME_OVER));

    // PERFORMANCE: Use event-driven UI hover state from guard (O(1))
    const isInteractionBlocked = isStateBlocked || InteractivityGuard.isPointerOverUI();

    // Only update feedback animation if hovering and NOT blocked
    if (!isInteractionBlocked && (this.hoveredCell || this.uiHoveredCell)) {
        this.feedbackHandler.update(now);
    }

    // 1. Primary interaction logic - Raycasting
    const pickedIntersection = !isInteractionBlocked ? this.raycastService.getPickedIntersection() : null;
    const pickedTile = pickedIntersection ? pickedIntersection.object : null;

    // Determine current cell early for comparison
    let currentX = -1, currentZ = -1, isPlayerSide = false;
    if (pickedTile && pickedIntersection) {
      if (pickedTile.userData.isRaycastPlane) {
        const localPoint = pickedTile.worldToLocal(pickedIntersection.point.clone());
        currentX = Math.floor(localPoint.x + Config.board.width / 2);
        currentZ = Math.floor(localPoint.z + Config.board.width / 2);
      } else {
        const isInstanced = pickedTile.userData.isInstancedGrid;
        currentX = isInstanced && pickedIntersection.instanceId !== undefined ? pickedIntersection.instanceId % Config.board.width : pickedTile.userData.cellX;
        currentZ = isInstanced && pickedIntersection.instanceId !== undefined ? Math.floor(pickedIntersection.instanceId / Config.board.width) : pickedTile.userData.cellZ;
      }
      currentX = Math.max(0, Math.min(Config.board.width - 1, currentX));
      currentZ = Math.max(0, Math.min(Config.board.width - 1, currentZ));
      isPlayerSide = pickedTile.userData.isPlayerSide;
    }

    const stateHasChanged = this.stateTracker.hasStateChanged(
        currentX, currentZ, isPlayerSide, gameState, orientation, shipId
    );

    if (!stateHasChanged) {
      return;
    }

    if (pickedTile && pickedIntersection && !isInteractionBlocked) {
      const hoverX = currentX;
      const hoverZ = currentZ;

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
          const now = performance.now();
          const isCacheValid = this.stateTracker.isGhostCacheValid(now, x, z, orientation, ship.id);

          if (!isCacheValid) {
            const targetBoard = Config.rogueMode ? this.gameLoop.match.sharedBoard : this.gameLoop.match.playerBoard;
            // Hover cell is the bow — derive head (stern) from it
            const s = ship.size - 1;
            let headX = x, headZ = z;
            if (orientation === Orientation.Horizontal) headX = x - s;
            else if (orientation === Orientation.Vertical) headZ = z - s;
            else if (orientation === Orientation.Left) headX = x + s;
            else if (orientation === Orientation.Up) headZ = z + s;
            const isValid = this.gameLoop.match.validatePlacement(targetBoard, ship, headX, headZ, orientation);
            this.feedbackHandler.updateGhost(ship, orientation, pickedTile, isValid, x, z);

            this.stateTracker.updateGhostCache(now, x, z, orientation, ship.id, isValid);
          }
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
          const localOffset = new THREE.Vector3(x - Config.board.width / 2 + 0.5, 0, z - Config.board.width / 2 + 0.5);

          if (pickedTile.userData.isRaycastPlane) {
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
      const isPlayerSide = pickedTile.userData.isPlayerSide;

      // Throttle event emission to only when the cell/side changes
      const cellChanged = !this.lastEmittedCell ||
        this.lastEmittedCell.x !== hoverX ||
        this.lastEmittedCell.z !== hoverZ ||
        this.lastEmittedCell.isPlayerSide !== isPlayerSide;

      if (cellChanged) {
        this.lastEmittedCell = { x: hoverX, z: hoverZ, isPlayerSide };
        eventBus.emit(GameEventType.MOUSE_CELL_HOVER, {
          x: hoverX,
          z: hoverZ,
          isPlayerSide,
          source: '3d',
          clientX: this.lastMouseClientX,
          clientY: this.lastMouseClientY
        });
      }

    } else {
      this.feedbackHandler.ghostGroup.visible = false;
      this.feedbackHandler.hoverCursor.visible = false;
      this.hoveredCell = null;

      this.handleCellLeave();

      if (this.uiHoveredCell && !isStateBlocked) {
        const { x, z } = this.uiHoveredCell;

        const { scaleX, scaleZ } = this.calculateHoverScale();
        const worldPos = new THREE.Vector3(x - Config.board.width / 2 + 0.5, 1.25, z - Config.board.width / 2 + 0.5);
        this.feedbackHandler.hoverCursor.position.copy(worldPos);
        this.feedbackHandler.hoverCursor.visible = true;
        this.feedbackHandler.hoverCursor.quaternion.identity();
        this.feedbackHandler.hoverCursor.scale.set(scaleX, 1, scaleZ);
      } else {
        this.feedbackHandler.hoverCursor.visible = false;
      }
    }

    this.feedbackHandler.updateHighlighters(this.gameLoop);
    (window as any).isHoveringBattlefield = this.hoveredCell !== null;
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
}
