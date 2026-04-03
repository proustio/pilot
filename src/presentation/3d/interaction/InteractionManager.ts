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

export class InteractionManager {
  private gameLoop: any = null;

  private raycastService: RaycastService;
  private feedbackHandler: InputFeedbackHandler;
  private clickHandler: ClickHandler;

  private lastMouseClientX: number = 0;
  private lastMouseClientY: number = 0;
  private isShiftDown: boolean = false;

  public hoveredCell: { x: number, z: number } | null = null;
  private uiHoveredCell: { x: number, z: number, isPlayerSide: boolean } | null = null;
  public interactionEnabled: boolean = true;

  private lastMoveShipId: string | null = null;
  private lastMoveShipX: number = -1;
  private lastMoveShipZ: number = -1;
  private lastMoveAction: string | null = null;
  private lastMovesRemaining: number = -1;

  private ghostCheckCache: {
    time: number;
    x: number;
    z: number;
    orientation: Orientation | null;
    shipId: string | null;
    isValid: boolean;
  } = { time: 0, x: -1, z: -1, orientation: null, shipId: null, isValid: false };

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, entityManager: any) {
    this.raycastService = new RaycastService(camera, entityManager);
    this.feedbackHandler = new InputFeedbackHandler(scene, entityManager);
    this.clickHandler = new ClickHandler(this.raycastService, entityManager);

    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.isShiftDown = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.isShiftDown = false; });

    this.setupGlobalListeners();
  }

  private setupGlobalListeners() {
    eventBus.on(GameEventType.SET_INTERACTION_ENABLED, (payload) => {
      this.interactionEnabled = payload.enabled;
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
    if (!this.uiHoveredCell) eventBus.emit(GameEventType.MOUSE_CELL_HOVER, null);
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
    this.feedbackHandler.update(performance.now());

    const pickedIntersection = this.raycastService.getPickedIntersection();
    const pickedTile = pickedIntersection ? pickedIntersection.object : null;

    const isStateBlocked = InteractivityGuard.isBlocked() ||
      !this.interactionEnabled ||
      this.isShiftDown ||
      (this.gameLoop && (this.gameLoop.isAnimating || this.gameLoop.currentState === GameState.GAME_OVER));

    const isPointerOverUI = InteractivityGuard.isPointerOverUI(this.lastMouseClientX, this.lastMouseClientY);
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
          const now = performance.now();
          const cache = this.ghostCheckCache;
          const isSameState = cache.x === x && cache.z === z && cache.orientation === orientation && cache.shipId === ship.id;
          const isCacheValid = isSameState && (now - cache.time < 300);

          if (!isCacheValid) {
            const targetBoard = Config.rogueMode ? this.gameLoop.match.sharedBoard : this.gameLoop.match.playerBoard;
            const isValid = this.gameLoop.match.validatePlacement(targetBoard, ship, x, z, orientation);
            this.feedbackHandler.updateGhost(ship, orientation, pickedTile, isValid, x, z);

            cache.time = now;
            cache.x = x;
            cache.z = z;
            cache.orientation = orientation;
            cache.shipId = ship.id;
            cache.isValid = isValid;
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
        const worldPos = new THREE.Vector3(x - Config.board.width / 2 + 0.5, 1.25, z - Config.board.width / 2 + 0.5);
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
