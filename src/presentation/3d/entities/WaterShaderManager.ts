

export class WaterShaderManager {
    private playerRippleIndex: number = 0;
    private enemyRippleIndex: number = 0;
    private time: number = 0;

    constructor(
        private playerWaterUniforms: any,
        private enemyWaterUniforms: any
    ) {}
    
    public getUniformsForBoard(isPlayerBoard: boolean): any {
        return isPlayerBoard ? this.playerWaterUniforms : this.enemyWaterUniforms;
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

    public update(time: number, gameSpeedMultiplier: number) {
        this.time = time;
        const waterTimeIncrement = 0.016 * gameSpeedMultiplier;
        
        this.updateWaterUniforms(this.playerWaterUniforms, waterTimeIncrement, gameSpeedMultiplier);
        this.updateWaterUniforms(this.enemyWaterUniforms, waterTimeIncrement, gameSpeedMultiplier);
    }

    private updateWaterUniforms(uniforms: any, waterTimeIncrement: number, gameSpeedMultiplier: number) {
        if (!uniforms) return;
        uniforms.time.value = this.time;
        for (let i = 0; i < 5; i++) {
            if (uniforms.rippleTimes.value[i] > 0) {
                uniforms.rippleTimes.value[i] += waterTimeIncrement;
                if (uniforms.rippleTimes.value[i] > (2.0 / gameSpeedMultiplier)) {
                    uniforms.rippleTimes.value[i] = 0;
                }
            }
        }
        if (uniforms.globalTurbulence.value > 0) {
            uniforms.globalTurbulence.value = Math.max(0, uniforms.globalTurbulence.value - waterTimeIncrement * 0.2);
        }
    }
}
