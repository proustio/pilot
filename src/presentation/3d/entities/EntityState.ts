import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';

export class EntityState {
    public masterBoardGroup: THREE.Group = new THREE.Group();
    public staticGroup: THREE.Group = new THREE.Group();
    public playerBoardGroup: THREE.Group = new THREE.Group();
    public enemyBoardGroup: THREE.Group = new THREE.Group();

    public playerGridTiles: THREE.Object3D[] = [];
    public enemyGridTiles: THREE.Object3D[] = [];

    public fogMeshes: (THREE.Mesh | null)[] = new Array(Config.board.width * Config.board.height).fill(null);
    public fallingMarkers: { mesh: THREE.Object3D, curve: THREE.QuadraticBezierCurve3, progress: number, worldX: number, worldZ: number, result: string, isPlayer: boolean, cellX: number, cellZ: number, isReplayFlag: boolean }[] = [];

    public playerWaterUniforms: any = null;
    public enemyWaterUniforms: any = null;

    public playerRippleIndex: number = 0;
    public enemyRippleIndex: number = 0;

    constructor() {
        // Position faces: Player points UP, Enemy points DOWN
        this.playerBoardGroup.position.y = 1.2; // Increased from 0.8 to 1.2
        this.enemyBoardGroup.position.y = -1.2; // Increased from -0.8 to -1.2
        this.enemyBoardGroup.rotation.x = Math.PI; // Flipped upside down

        this.masterBoardGroup.add(this.playerBoardGroup);
        this.masterBoardGroup.add(this.enemyBoardGroup);
    }

    public addRipple(worldX: number, worldZ: number, isPlayerBoard: boolean) {
        const uniforms = isPlayerBoard ? this.playerWaterUniforms : this.enemyWaterUniforms;
        let rIndex = isPlayerBoard ? this.playerRippleIndex : this.enemyRippleIndex;

        if (uniforms) {
            uniforms.rippleCenters.value[rIndex].set(worldX, -worldZ);
            uniforms.rippleTimes.value[rIndex] = 0.01;
            rIndex = (rIndex + 1) % 5;

            if (isPlayerBoard) this.playerRippleIndex = rIndex;
            else this.enemyRippleIndex = rIndex;
        }
    }
}
