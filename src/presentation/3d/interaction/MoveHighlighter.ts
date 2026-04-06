import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { GameState } from '../../../application/game-loop/GameLoop';
import { MatchMode } from '../../../domain/match/Match';

export class MoveHighlighter {
    public moveHighlightGroup: THREE.Group;
    private moveInstancedMesh: THREE.InstancedMesh;
    private readonly maxCells: number;
    private readonly zeroMatrix: THREE.Matrix4;

    private readonly _tempMatrix = new THREE.Matrix4();
    private readonly _tempQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, 0)
    );

    private lastMoveShipId: string | null = null;
    private lastMoveAction: string | null = null;
    private lastMovesRemaining: number = -1;

    constructor(highlightParent: THREE.Object3D) {
        this.maxCells = Config.board.width * Config.board.height;
        this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

        this.moveHighlightGroup = new THREE.Group();
        this.moveHighlightGroup.renderOrder = 998;
        this.moveHighlightGroup.visible = false;
        highlightParent.add(this.moveHighlightGroup);

        const moveMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false
        });
        const moveGeo = new THREE.PlaneGeometry(0.9, 0.9);
        this.moveInstancedMesh = new THREE.InstancedMesh(
            moveGeo, moveMat, this.maxCells
        );
        this.moveInstancedMesh.renderOrder = 999;
        
        for (let i = 0; i < this.moveInstancedMesh.count; i++) {
            this.moveInstancedMesh.setMatrixAt(i, this.zeroMatrix);
        }
        this.moveInstancedMesh.instanceMatrix.needsUpdate = true;

        this.moveHighlightGroup.add(this.moveInstancedMesh);
    }

    public update(gameLoop: any): void {
        if (!gameLoop || gameLoop.currentState !== GameState.PLAYER_TURN || !gameLoop.match || gameLoop.match.mode !== MatchMode.Rogue) {
            this.moveHighlightGroup.visible = false;
            return;
        }

        const action = (window as any).selectedRogueAction || 'move';
        if (action !== 'move') {
            this.moveHighlightGroup.visible = false;
            this.lastMoveAction = action;
            return;
        }

        const order = gameLoop.rogueShipOrder;
        const index = gameLoop.activeRogueShipIndex;
        const activeShip = order && index >= 0 && index < order.length ? order[index] : null;

        if (!activeShip || activeShip.hasActedThisTurn || activeShip.movesRemaining <= 0) {
            this.moveHighlightGroup.visible = false;
            return;
        }

        this.moveHighlightGroup.visible = true;

        if (this.lastMoveShipId !== activeShip.id || this.lastMoveAction !== action || this.lastMovesRemaining !== activeShip.movesRemaining) {
            this.rebuildMesh(activeShip, gameLoop.match.sharedBoard);
            this.lastMoveShipId = activeShip.id;
            this.lastMoveAction = action;
            this.lastMovesRemaining = activeShip.movesRemaining;
        }
    }

    private rebuildMesh(ship: any, board: any): void {
        const moves = ship.movesRemaining;
        const boardOffset = Config.board.width / 2;
        let slotIndex = 0;

        for (let x = 0; x < board.width; x++) {
            for (let z = 0; z < board.height; z++) {
                const dx = Math.abs(x - ship.headX);
                const dz = Math.abs(z - ship.headZ);
                if (dx + dz > 0 && dx + dz <= moves) {
                    const targetX = x - boardOffset + 0.5;
                    const targetZ = z - boardOffset + 0.5;
                    this._tempMatrix.compose(
                        new THREE.Vector3(targetX, 0.2, targetZ),
                        this._tempQuat,
                        new THREE.Vector3(1, 1, 1)
                    );
                    this.moveInstancedMesh.setMatrixAt(slotIndex, this._tempMatrix);
                    slotIndex++;
                }
            }
        }

        this.moveInstancedMesh.count = slotIndex;
        this.moveInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    public hide(): void {
        this.moveHighlightGroup.visible = false;
    }

    public dispose(): void {
        this.moveInstancedMesh.geometry.dispose();
        if (Array.isArray(this.moveInstancedMesh.material)) {
            this.moveInstancedMesh.material.forEach(m => m.dispose());
        } else {
            (this.moveInstancedMesh.material as THREE.Material).dispose();
        }
    }
}
