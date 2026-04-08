import * as THREE from 'three';
import { GameState } from '../../../application/game-loop/GameLoop';
import { InteractivityGuard } from '../../InteractivityGuard';
import { MatchMode } from '../../../domain/match/Match';
import { CellState } from '../../../domain/board/Board';
import { Config } from '../../../infrastructure/config/Config';
import { RaycastService } from './RaycastService';

/**
 * Handles mouse click resolution, cell validation, error sounds,
 * and click listener dispatch.
 *
 * Extracted from InteractionManager to keep that class focused on
 * hover updates, highlight delegation, and event setup.
 */
export class ClickHandler {
    private entityManager: any;
    private gameLoop: any = null;
    private raycastService: RaycastService;
    private interactionEnabled: boolean = true;
    private clickListeners: ((x: number, z: number, isPlayerSide: boolean) => void)[] = [];

    constructor(raycastService: RaycastService, entityManager: any) {
        this.raycastService = raycastService;
        this.entityManager = entityManager;

        window.addEventListener('click', this.onMouseClick.bind(this));
    }

    public setGameLoop(gameLoop: any): void {
        this.gameLoop = gameLoop;
    }

    public setInteractionEnabled(enabled: boolean): void {
        this.interactionEnabled = enabled;
    }

    public onClick(listener: (x: number, z: number, isPlayerSide: boolean) => void): void {
        this.clickListeners.push(listener);
    }

    private playErrorSound(): void {
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

    private onMouseClick(event: MouseEvent): void {
        if (event.shiftKey) return;

        if (InteractivityGuard.isBlocked() || !this.interactionEnabled ||
            (this.gameLoop && (this.gameLoop.isAnimating || this.gameLoop.currentState === GameState.GAME_OVER))) {
            return;
        }

        if (InteractivityGuard.isPointerOverUI(event.clientX, event.clientY)) return;

        const intersects = this.raycastService.getIntersections(this.entityManager.getInteractableObjects());
        if (intersects.length > 0) {
            const hit = intersects.find((i: THREE.Intersection) =>
                i.object.userData.isGridTile || i.object.userData.isInstancedGrid || i.object.userData.isRaycastPlane
            );
            if (hit) {
                let x, z;
                if (hit.object.userData.isRaycastPlane) {
                    const localPoint = hit.object.worldToLocal(hit.point.clone());
                    x = Math.floor(localPoint.x + Config.board.width / 2);
                    z = Math.floor(localPoint.z + Config.board.width / 2);
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

                    const targetBoard = isRogue
                        ? this.gameLoop.match.sharedBoard
                        : (isPlayerSide ? this.gameLoop.match.playerBoard : this.gameLoop.match.enemyBoard);
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
}
