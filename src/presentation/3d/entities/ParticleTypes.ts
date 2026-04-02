import * as THREE from 'three';
import { Config } from '../../../infrastructure/config/Config';

// ── Interfaces ──────────────────────────────────────────────────────────────

export type ParticlePoolType = 'fire' | 'smoke' | 'explosion' | 'splash' | 'fog';

export interface InstancedParticle {
    poolType: ParticlePoolType;
    poolRef: InstancePool;
    slotIndex: number;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    rotation: THREE.Euler;
    scale: number;
    scaleDelta: number;
    rotationDelta: number;
    gravityModifier: number;
    colorFadeRate: number;
    opacity: number;
    life: number;
    maxLife: number;
    /** Timestamp-like ordering for oldest-eviction */
    spawnOrder: number;
}

export interface InstancePool {
    mesh: THREE.InstancedMesh;
    capacity: number;
    activeCount: number;
    freeSlots: number[];
    /** Maps slot index → index in particles[] array */
    slotToParticleIndex: Map<number, number>;
}

// ── Pool configuration ──────────────────────────────────────────────────────

export const PARTICLE_POOL_CONFIG = {
    fire: { get capacity() { return Config.particles.firePoolCapacity; }, size: 0.12 },
    smoke: { get capacity() { return Config.particles.smokePoolCapacity; }, size: 0.12 },
    explosion: { get capacity() { return Config.particles.explosionPoolCapacity; }, size: 0.15 },
    splash: { get capacity() { return Config.particles.splashPoolCapacity; }, size: 0.15 },
    fog: { get capacity() { return Config.particles.fogPoolCapacity; }, size: 0.15 },
};

// ── Shared Helpers ──────────────────────────────────────────────────────────

export const _tempMatrix = new THREE.Matrix4();
export const _tempQuaternion = new THREE.Quaternion();
export const _tempScale = new THREE.Vector3();
export const _tempColor = new THREE.Color();
export const _white = new THREE.Color(0xffffff);
export const _tempPos = new THREE.Vector3();
