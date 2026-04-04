import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';
import { SonarEffect } from './SonarEffect';
import { TurretInstanceManager } from './TurretInstanceManager';

/**
 * Tracks per-frame animation state: active sinking/moving/rotating ships,
 * sonar effects, LED pulsing, camera shake, turret instance matrix sync,
 * and the "busy" flag that gates turn progression.
 *
 * Extracted from EntityManager to keep that class under the ~400-line
 * guideline and to concentrate the hot-path code in one place for
 * performance tuning.
 */
export class AnimationStateTracker {
    // Data-Oriented active animation arrays
    public activelySinkingShips: THREE.Object3D[] = [];
    public activelyMovingShips: THREE.Object3D[] = [];
    public activelyRotatingShips: THREE.Object3D[] = [];

    // Sonar ping visual effects
    private activeSonarEffects: SonarEffect[] = [];

    // LED animation via instanced mesh
    private ledMesh: THREE.InstancedMesh | null = null;
    private ledPhases: number[] = [];

    // Camera shake state for ramming impacts
    private cameraShakeElapsedMs: number = 0;
    private cameraShakeDurationMs: number = 0;
    private cameraShakeIntensity: number = 0;

    // Reusable color to avoid per-frame allocation
    private readonly _ledColor = new THREE.Color(0x4169E1);

    // Phase flag — set by EntityManager on state transitions
    private isSetupPhase: boolean = false;

    constructor(
        private playerBoardGroup: THREE.Group,
        private enemyBoardGroup: THREE.Group,
        private playerTurretManager: TurretInstanceManager,
        private enemyTurretManager: TurretInstanceManager
    ) {}

    // ── Setup Phase Guard ────────────────────────────────────────

    public setSetupPhase(isSetup: boolean): void {
        this.isSetupPhase = isSetup;
    }

    // ── LED Mesh Reference ───────────────────────────────────────

    public setLedMesh(mesh: THREE.InstancedMesh | null, phases: number[]): void {
        this.ledMesh = mesh;
        this.ledPhases = phases;
    }

    // ── Turret Manager Hot-swap (used on resetMatch) ─────────────

    public setTurretManagers(player: TurretInstanceManager, enemy: TurretInstanceManager): void {
        this.playerTurretManager = player;
        this.enemyTurretManager = enemy;
    }

    // ── Sonar Effects ────────────────────────────────────────────

    public addSonarEffect(effect: SonarEffect): void {
        this.activeSonarEffects.push(effect);
    }

    // ── Camera Shake ─────────────────────────────────────────────

    public triggerCameraShake(durationMs: number, intensity: number): void {
        this.cameraShakeElapsedMs = 0;
        this.cameraShakeDurationMs = durationMs;
        this.cameraShakeIntensity = intensity;
    }

    // ── Busy Check ───────────────────────────────────────────────

    /**
     * Returns true if any visual animation is still playing that should
     * block the next game action. During setup phase, nothing can be
     * animating, so we short-circuit immediately.
     */
    public isBusy(
        projectileManager: { hasFallingMarkers(): boolean },
        particleSystem: { hasActiveParticles(): boolean },
        shipAnimator: { hasActivePathAnimation(): boolean }
    ): boolean {
        // Performance: nothing animates during ship placement
        if (this.isSetupPhase) return false;

        if (projectileManager.hasFallingMarkers()) return true;
        if (particleSystem.hasActiveParticles()) return true;
        if (this.activeSonarEffects.some(effect => effect.isActive())) return true;
        if (shipAnimator.hasActivePathAnimation()) return true;

        const sinkFloor = Config.visual.sinkingFloor;
        for (const group of [this.playerBoardGroup, this.enemyBoardGroup]) {
            for (const child of group.children) {
                if (child.userData.isShip && (
                    (child.userData.isSinking && child.position.y > sinkFloor) ||
                    (child.userData.targetPosition &&
                        child.position.distanceToSquared(child.userData.targetPosition) > 0.001)
                )) {
                    return true;
                }
            }
        }
        return false;
    }

    // ── Per-Frame Update ─────────────────────────────────────────

    /**
     * Runs all animation-state updates for the current frame.
     * Called from EntityManager.update().
     */
    public update(camera: THREE.Camera): void {
        this.updateStaticAnimations();
        this.updateSonarEffects();
        this.updateRammingRotations();
        this.updateCameraShake(camera);
        this.updateTurretTransforms();
    }

    // ── LED Pulsing ──────────────────────────────────────────────

    private updateStaticAnimations(): void {
        if (!this.ledMesh || this.ledPhases.length === 0) return;

        for (let i = 0; i < this.ledPhases.length; i++) {
            this.ledPhases[i] += 0.05;
            const opacity = 0.3 + (0.5 + Math.sin(this.ledPhases[i]) * 0.5) * 0.7;
            this._ledColor.setHex(0x4169E1);
            this._ledColor.multiplyScalar(opacity);
            this.ledMesh.setColorAt(i, this._ledColor);
        }
        this.ledMesh.instanceColor!.needsUpdate = true;
    }

    // ── Sonar Effect Ticking ─────────────────────────────────────

    private updateSonarEffects(): void {
        const dt = 1 / 60;
        for (let i = this.activeSonarEffects.length - 1; i >= 0; i--) {
            if (!this.activeSonarEffects[i].update(dt)) {
                this.activeSonarEffects.splice(i, 1);
            }
        }
    }

    // ── Ramming Rotation Animations ──────────────────────────────

    /**
     * Updates smooth 90° rotation animations triggered by ramming events.
     * Uses flat arrays and swap-and-pop for O(1) removal.
     */
    private updateRammingRotations(): void {
        const dtMs = 16.67 * Config.timing.gameSpeedMultiplier;

        for (let i = this.activelyRotatingShips.length - 1; i >= 0; i--) {
            const child = this.activelyRotatingShips[i];
            const anim = child.userData.rotationAnim;
            if (!anim) {
                this.activelyRotatingShips[i] = this.activelyRotatingShips[this.activelyRotatingShips.length - 1];
                this.activelyRotatingShips.pop();
                continue;
            }

            anim.elapsedMs += dtMs;
            const t = Math.min(anim.elapsedMs / anim.durationMs, 1.0);
            const eased = 1 - Math.pow(1 - t, 3);

            let diff = ((anim.targetRotY - anim.startRotY) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
            child.rotation.y = anim.startRotY + diff * eased;

            if (t >= 1.0) {
                child.rotation.y = anim.targetRotY;
                child.userData.rotationAnim = null;
                this.activelyRotatingShips[i] = this.activelyRotatingShips[this.activelyRotatingShips.length - 1];
                this.activelyRotatingShips.pop();
            }
        }
    }

    // ── Camera Shake ─────────────────────────────────────────────

    /**
     * Applies sinusoidal camera shake that decays over time.
     */
    private updateCameraShake(camera: THREE.Camera): void {
        if (this.cameraShakeDurationMs <= 0) return;

        const dtMs = 16.67 * Config.timing.gameSpeedMultiplier;
        this.cameraShakeElapsedMs += dtMs;

        if (this.cameraShakeElapsedMs >= this.cameraShakeDurationMs) {
            this.cameraShakeDurationMs = 0;
            return;
        }

        const progress = this.cameraShakeElapsedMs / this.cameraShakeDurationMs;
        const decay = 1 - progress;
        const frequency = 30;
        const offsetY = Math.sin(progress * frequency) * this.cameraShakeIntensity * decay;
        const offsetX = Math.cos(progress * frequency * 0.7) * this.cameraShakeIntensity * decay * 0.5;
        camera.position.y += offsetY;
        camera.position.x += offsetX;
    }

    // ── Turret Instance Transform Sync ───────────────────────────

    /**
     * Updates turret instance matrices based on actively animating ships
     * using the flat active arrays instead of full tree traversal.
     */
    private updateTurretTransforms(): void {
        const sinkFloor = Config.visual.sinkingFloor;
        const dirtyShips = new Set<THREE.Object3D>();

        for (let i = this.activelySinkingShips.length - 1; i >= 0; i--) {
            const shipGroup = this.activelySinkingShips[i];
            if (shipGroup.position.y <= sinkFloor) {
                this.activelySinkingShips[i] = this.activelySinkingShips[this.activelySinkingShips.length - 1];
                this.activelySinkingShips.pop();
            } else {
                dirtyShips.add(shipGroup);
            }
        }

        for (let i = this.activelyMovingShips.length - 1; i >= 0; i--) {
            const shipGroup = this.activelyMovingShips[i];
            const hasTargetPos = shipGroup.userData.targetPosition &&
                shipGroup.position.distanceToSquared(shipGroup.userData.targetPosition) > 0.001;
            const hasPathAnim = !!shipGroup.userData.pathAnimation;
            if (!hasTargetPos && !hasPathAnim) {
                this.activelyMovingShips[i] = this.activelyMovingShips[this.activelyMovingShips.length - 1];
                this.activelyMovingShips.pop();
            } else {
                dirtyShips.add(shipGroup);
            }
        }

        for (let i = 0; i < this.activelyRotatingShips.length; i++) {
            dirtyShips.add(this.activelyRotatingShips[i]);
        }

        dirtyShips.forEach(child => {
            const ship = child.userData.ship;
            if (!ship) return;

            const isPlayer = child.parent === this.playerBoardGroup;
            const turretManager = isPlayer ? this.playerTurretManager : this.enemyTurretManager;

            child.updateMatrix();
            turretManager.updateTransform(ship.id, child.matrix);
        });
    }
}
