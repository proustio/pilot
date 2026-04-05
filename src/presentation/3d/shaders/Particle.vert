uniform float time;
uniform float gameSpeed; // To allow speed control

attribute vec3 instanceVelocity;
attribute float spawnTime;
attribute float maxLife;
attribute float particleType; // 0=fire, 1=smoke, 2=explosion, 3=splash, 4=voxelExplosion, 5=fog

varying vec3 vColor;
varying float vOpacity;
varying float vLifeRatio;
varying float vParticleType;

void main() {
    float age = (time - spawnTime) * gameSpeed;

    // Default position based on initial attributes
    vec3 currentPos = position * instanceMatrix[0][0]; // Scale from instanceMatrix (which acts as initial scale)

    // Apply transformations based on age and particle type
    vec3 animatedPos = vec3(0.0);
    float fpsScale = 60.0;

    float currentScale = 1.0;
    float opacity = 1.0;

    if (age > 0.0 && age < maxLife && particleType != 5.0) {
        // Fire (0)
        if (particleType == 0.0) {
            animatedPos = instanceVelocity * (age * fpsScale);
            currentScale = pow(0.96, age * 60.0); // Shrinks over time
            animatedPos.x += sin(age * 10.0 + spawnTime) * 0.1 * age;
            animatedPos.z += cos(age * 10.0 + spawnTime) * 0.1 * age;
            // Flicker logic done in fragment shader or just vary opacity here
        }
        // Smoke (1)
        else if (particleType == 1.0) {
            animatedPos = instanceVelocity * (age * fpsScale);
            currentScale = 1.0 + age * 0.5; // Expands over time
            animatedPos.x += sin(age * 5.0 + spawnTime) * 0.1 * age;
            animatedPos.z += cos(age * 5.0 + spawnTime) * 0.1 * age;
            opacity = 0.8 * (1.0 - (age / maxLife)); // Fades out
        }
        // Explosion/Splash/Voxel (2, 3, 4)
        else {
            vec3 vel = instanceVelocity * fpsScale;
            // Gravity
            vel.y -= 0.5 * fpsScale * age;
            animatedPos = vel * age;

            // Scale down at end of life
            if (age > maxLife * 0.7) {
                currentScale = 1.0 - ((age - maxLife * 0.7) / (maxLife * 0.3));
            }

            if (particleType == 3.0) { // Splash
                opacity = 0.8 * (1.0 - (age / maxLife));
            }
        }
    } else if (particleType == 5.0) { // Fog
        animatedPos = vec3(0.0);
        currentScale = 1.0;
        opacity = 0.6;
    } else if (age >= maxLife) {
        currentScale = 0.0; // Hide expired particles
    }

    // Apply rotation
    float rotAngle = age * 3.0; // Adjust rotation speed
    if (particleType != 5.0 && particleType != 3.0) { // No rotation for fog and splash
        mat4 rotY = mat4(
            cos(rotAngle), 0.0, sin(rotAngle), 0.0,
            0.0, 1.0, 0.0, 0.0,
            -sin(rotAngle), 0.0, cos(rotAngle), 0.0,
            0.0, 0.0, 0.0, 1.0
        );
        mat4 rotX = mat4(
            1.0, 0.0, 0.0, 0.0,
            0.0, cos(rotAngle), -sin(rotAngle), 0.0,
            0.0, sin(rotAngle), cos(rotAngle), 0.0,
            0.0, 0.0, 0.0, 1.0
        );
        vec4 rotatedPos = rotY * rotX * vec4(currentPos * currentScale, 1.0);
        currentPos = rotatedPos.xyz;
    } else {
        currentPos *= currentScale;
    }

    vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); // Get initial position

    // We add the animation offset to the initial position
    vec4 finalPos = vec4(currentPos + animatedPos + instancePos.xyz, 1.0);

    vec4 mvPosition = viewMatrix * modelMatrix * finalPos;
    gl_Position = projectionMatrix * mvPosition;

    vColor = instanceColor;
    vOpacity = opacity;
    vLifeRatio = clamp(age / maxLife, 0.0, 1.0);
    vParticleType = particleType;
}
