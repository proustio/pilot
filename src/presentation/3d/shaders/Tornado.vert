uniform float time;
uniform vec3 color;
attribute float voxelIndex;

varying vec3 vColor;
varying float vOpacity;

void main() {
    // Basic constants matching the original TS logic
    float totalHeight = 2.5;
    float tightness = 3.14159 * 4.0;
    float baseRadius = 0.05;
    float topRadius = 0.7;
    float spiralCount = 6.0;
    float voxelsPerSpiral = 120.0 / spiralCount;

    // Use negative speed if it's an enemy (determined by a uniform or logic in JS setting the time multiplier)
    // For now, time includes the speed direction, so we just use it directly.
    float speed = 1.0;

    // Determine spiral parameters
    float spiralIndex = mod(voxelIndex, spiralCount);
    float stepInSpiral = floor(voxelIndex / spiralCount);
    float t = stepInSpiral / voxelsPerSpiral;

    float y = t * totalHeight;

    float angleOffset = (spiralIndex / spiralCount) * 3.14159 * 2.0;
    float angle = time + (t * tightness) + angleOffset;

    float pulse = sin(time * 0.8) * 0.15; // Adjusted time scaling to match roughly time * 0.004 in JS
    float r = (baseRadius + (t * (topRadius - baseRadius))) * (1.0 + pulse * t);

    float x = cos(angle) * r;
    float z = sin(angle) * r;

    float individualPulse = sin(time * 2.0 + t * 10.0) * 0.1;
    float scale = (0.7 + individualPulse) * (0.5 + t * 0.5);

    // Build transformation matrices
    // 1. Rotation Y (angle)
    mat4 rotY = mat4(
        cos(angle), 0.0, sin(angle), 0.0,
        0.0, 1.0, 0.0, 0.0,
        -sin(angle), 0.0, cos(angle), 0.0,
        0.0, 0.0, 0.0, 1.0
    );

    // 2. Rotation X (t * PI)
    float rotXAngle = t * 3.14159;
    mat4 rotX = mat4(
        1.0, 0.0, 0.0, 0.0,
        0.0, cos(rotXAngle), -sin(rotXAngle), 0.0,
        0.0, sin(rotXAngle), cos(rotXAngle), 0.0,
        0.0, 0.0, 0.0, 1.0
    );

    mat4 scaleMat = mat4(
        scale, 0.0, 0.0, 0.0,
        0.0, scale, 0.0, 0.0,
        0.0, 0.0, scale, 0.0,
        0.0, 0.0, 0.0, 1.0
    );

    mat4 transMat = mat4(
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        x, y, z, 1.0
    );

    // Final transformation: Translate * RotY * RotX * Scale * Position
    mat4 finalTransform = transMat * rotY * rotX * scaleMat;

    vec4 localPosition = finalTransform * vec4(position, 1.0);

    // Compute view and screen position
    // Note: We use instanceMatrix from InstancedMesh, which sets the base position of the tornado
    vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * localPosition;
    gl_Position = projectionMatrix * mvPosition;

    // Pass color to fragment shader
    vColor = instanceColor;
    vOpacity = 0.8;
}
