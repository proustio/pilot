import * as THREE from 'three';
import { FogManager } from './FogManager';
import fogShaderMain from '../shaders/Fog.vert?raw';
import fogShaderNormal from '../shaders/FogNormal.vert?raw';
import fogShaderPosition from '../shaders/FogPosition.vert?raw';

export interface FogAssets {
    fogVoxelGeo: THREE.BoxGeometry;
    fogMat: THREE.MeshStandardMaterial;
    numVoxels: number;
}

/**
 * Creates fog voxel geometry, fog material with shader injection,
 * and initializes fog assets on the FogManager (classic + rogue).
 */
export class FogMeshFactory {
    /**
     * Builds fog geometry, material, and instanced buffer attributes.
     * Initializes the FogManager's dynamic assets and (for rogue mode)
     * creates the reduced-voxel geometry variant.
     *
     * Returns the fog geometry, material, and voxel count for use
     * during per-cell fog cloud creation in BoardBuilder.
     */
    public static build(fogManager: FogManager): FogAssets {
        const fogVoxelGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const fogMat = new THREE.MeshStandardMaterial({
            color: 0x000080,
            emissive: 0x4169E1,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.85,
            roughness: 0.2,
            metalness: 0.8
        });

        fogMat.onBeforeCompile = (shader) => {
            shader.uniforms.uFogTime = { value: 0 };
            fogMat.userData.shader = shader;

            shader.vertexShader = `
                ${fogShaderMain}
                ${shader.vertexShader}
            `;

            shader.vertexShader = shader.vertexShader.replace(
                `#include <beginnormal_vertex>`,
                fogShaderNormal
            );

            shader.vertexShader = shader.vertexShader.replace(
                `#include <begin_vertex>`,
                fogShaderPosition
            );
        };

        const numVoxels = 250;
        FogMeshFactory.populateVoxelAttributes(fogVoxelGeo, numVoxels);

        // For Rogue mode, create a reduced-voxel geometry (60 instead of 250)
        if (fogManager.rogueMode) {
            const rogueNumVoxels = 60;
            const rogueGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
            FogMeshFactory.populateVoxelAttributes(rogueGeo, rogueNumVoxels);
            fogManager.initializeDynamicAssets(rogueGeo, fogMat);
        } else {
            fogManager.initializeDynamicAssets(fogVoxelGeo, fogMat);
        }

        return { fogVoxelGeo, fogMat, numVoxels };
    }

    /**
     * Generates and attaches per-voxel instanced buffer attributes
     * (aBasePos, aScale, aPhase, aSpeed) to the given geometry.
     */
    private static populateVoxelAttributes(geo: THREE.BoxGeometry, count: number): void {
        const aBasePos = new Float32Array(count * 3);
        const aScale = new Float32Array(count);
        const aPhase = new Float32Array(count);
        const aSpeed = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            aBasePos[i * 3 + 0] = (Math.random() - 0.5) * 0.95;
            // Compress the Y-axis distribution by half (0.9 -> 0.45)
            aBasePos[i * 3 + 1] = (Math.random() - 0.5) * 0.45;
            aBasePos[i * 3 + 2] = (Math.random() - 0.5) * 0.95;

            aScale[i] = 1.0 + Math.random() * 0.8;
            aPhase[i] = Math.random() * Math.PI * 2;
            aSpeed[i] = 0.5 + Math.random() * 1.5;
        }

        geo.setAttribute('aBasePos', new THREE.InstancedBufferAttribute(aBasePos, 3));
        geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(aScale, 1));
        geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
        geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(aSpeed, 1));
    }
}
