varying vec3 vColor;
varying float vOpacity;
varying float vLifeRatio;
varying float vParticleType;

void main() {
    if (vLifeRatio >= 1.0 && vParticleType != 5.0) {
        discard; // Don't draw expired particles
    }

    vec3 finalColor = vColor;
    float finalOpacity = vOpacity;

    if (vParticleType == 0.0) { // Fire
        // Flicker
        float flicker = 1.0 + sin(vLifeRatio * 50.0) * 0.5;
        finalColor = min(vec3(1.0), finalColor * flicker);
    } else if (vParticleType == 1.0) { // Smoke
        // Simulate opacity by darkening
        finalColor *= finalOpacity;
        finalOpacity = 1.0; // Since we are using standard blending or not transparent
    }

    gl_FragColor = vec4(finalColor, finalOpacity);
}
