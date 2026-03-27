uniform vec3 baseColor;
uniform vec3 peakColor;
uniform float opacity;
varying float vElevation;

void main() {
    float mixStrength = (vElevation + 0.1) * 5.0;
    vec3 color = mix(baseColor, peakColor, clamp(mixStrength, 0.0, 1.0));
    
    gl_FragColor = vec4(color, opacity);
}
