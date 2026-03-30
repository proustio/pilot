import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';

/** Describes a continuous particle emitter (smoke, fire, or both). */
export interface Emitter {
    id?: string;
    x: number;
    y: number;
    z: number;
    color: string;
    hasFire: boolean;
    nextSpawn: number;
    intensity: number;
    group: THREE.Object3D;
}

/** Callback signature used by EmitterManager to request particle spawns. */
export interface EmitterSpawnCallback {
    spawnFire(x: number, y: number, z: number, group: THREE.Object3D, intensity: number): void;
    spawnSmoke(x: number, y: number, z: number, color: string, group: THREE.Object3D, intensity: number): void;
}

/**
 * Manages emitter registration, ID-based lookup, and spawn scheduling.
 * Delegates actual particle creation back to ParticleSystem via the
 * EmitterSpawnCallback interface.
 */
export class EmitterManager {
    private emitters: Emitter[] = [];

    /**
     * Registers a new continuous emitter at the given world position.
     * If an emitter with the same `id` already exists, the call is skipped
     * to preserve the original (user requirement "sections remain as-is").
     */
    public addEmitter(
        x: number, y: number, z: number,
        hasFire: boolean, group: THREE.Object3D,
        color: string, intensity: number = 1.0, id?: string
    ): void {
        if (id && this.emitters.some(e => e.id === id)) return;
        this.emitters.push({ x, y, z, color, hasFire, nextSpawn: 0, group, intensity, id });
    }

    /** Updates intensity for all emitters whose id starts with `prefix`. */
    public updateEmittersByIdPrefix(prefix: string, intensity: number): void {
        for (const emitter of this.emitters) {
            if (emitter.id && emitter.id.startsWith(prefix)) {
                emitter.intensity = intensity;
            }
        }
    }

    /**
     * Runs the spawn scheduling loop — checks each emitter's timer and
     * requests particle spawns via the provided callback.
     */
    public updateEmitters(spawner: EmitterSpawnCallback): void {
        const now = Date.now();
        const speed = Config.timing.gameSpeedMultiplier;

        for (const emitter of this.emitters) {
            if (now > emitter.nextSpawn) {
                if (emitter.hasFire) {
                    spawner.spawnFire(emitter.x, emitter.y, emitter.z, emitter.group, emitter.intensity);
                    spawner.spawnSmoke(emitter.x, emitter.y + 0.2, emitter.z, emitter.color, emitter.group, emitter.intensity);
                    emitter.nextSpawn = now + (150 / (emitter.intensity * speed));
                } else {
                    spawner.spawnSmoke(emitter.x, emitter.y, emitter.z, emitter.color, emitter.group, emitter.intensity);
                    emitter.nextSpawn = now + (200 / (emitter.intensity * speed));
                }
            }
        }
    }

    /** Removes all registered emitters. */
    public clear(): void {
        this.emitters = [];
    }
}
