uniform float uFogTime;
attribute vec3 aBasePos;
attribute float aScale;
attribute float aPhase;
attribute float aSpeed;

mat4 rotationXYZ(vec3 euler) {
    float cX = cos(euler.x); float sX = sin(euler.x);
    float cY = cos(euler.y); float sY = sin(euler.y);
    float cZ = cos(euler.z); float sZ = sin(euler.z);
    
    mat4 rotX = mat4(1.0, 0.0, 0.0, 0.0,
                     0.0, cX, sX, 0.0,
                     0.0, -sX, cX, 0.0,
                     0.0, 0.0, 0.0, 1.0);
                     
    mat4 rotY = mat4(cY, 0.0, -sY, 0.0,
                     0.0, 1.0, 0.0, 0.0,
                     sY, 0.0, cY, 0.0,
                     0.0, 0.0, 0.0, 1.0);
                     
    mat4 rotZ = mat4(cZ, sZ, 0.0, 0.0,
                     -sZ, cZ, 0.0, 0.0,
                     0.0, 0.0, 1.0, 0.0,
                     0.0, 0.0, 0.0, 1.0);
                     
    return rotZ * rotY * rotX;
}
