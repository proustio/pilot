#include <beginnormal_vertex>

// Use the cell's world position from modelMatrix to offset animation per-cell
float cellOffset = modelMatrix[3].x * 0.8 + modelMatrix[3].z * 1.2;
float fogCloudTime = uFogTime * 2.0;

// Multiply by 2.0 to increase the maximum rotation angle to +/- 2 radians
vec3 fogRot = vec3(
    sin(fogCloudTime * 0.8 + aPhase + cellOffset) * 2.0,
    cos(fogCloudTime * 0.7 + aPhase + cellOffset) * 2.0,
    sin(fogCloudTime * 0.9 + aPhase + cellOffset) * 2.0
);
mat4 customRot = rotationXYZ(fogRot);

objectNormal = (customRot * vec4(objectNormal, 0.0)).xyz;
