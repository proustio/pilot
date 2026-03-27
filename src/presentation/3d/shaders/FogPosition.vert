#include <begin_vertex>

transformed *= aScale;
transformed = (customRot * vec4(transformed, 1.0)).xyz;

vec3 fogPos = aBasePos;
// Reuse the same cellOffset for vertical bobbing
float cellOffsetBob = modelMatrix[3].x * 0.8 + modelMatrix[3].z * 1.2;
// Halved amplitude from 0.4 to 0.2 to keep it wavy but not too tall
fogPos.y += sin(fogCloudTime * aSpeed + aPhase + cellOffsetBob) * 0.2;
transformed += fogPos;
