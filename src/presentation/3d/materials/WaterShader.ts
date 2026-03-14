export const WaterShader = {
  vertexShader: `
    uniform float time;
    uniform float globalTurbulence;
    uniform vec2 rippleCenters[5];
    uniform float rippleTimes[5];
    varying float vElevation;
    void main() {
      vec3 transformed = position;
      
      float elevation = sin(transformed.x * 2.0 + time * 1.5) * 0.05 
                      + sin(transformed.y * 1.5 + time * 1.2) * 0.05;
                      
      elevation += sin(transformed.x * 5.0 + time * 4.0) * globalTurbulence;
      elevation += cos(transformed.y * 5.0 - time * 3.5) * globalTurbulence;
                      
      for (int i = 0; i < 5; i++) {
        if (rippleTimes[i] > 0.0) {
            float dist = distance(transformed.xy, rippleCenters[i]);
            float wave = sin((dist - rippleTimes[i] * 15.0) * 4.0);
            float attenuation = max(0.0, 1.0 - (dist / 5.0)) * max(0.0, 1.0 - (rippleTimes[i] / 2.0));
            float ringFront = max(0.0, 1.0 - abs(dist - rippleTimes[i] * 15.0) * 0.2);
            elevation += wave * attenuation * ringFront * 0.5;
        }
      }
      
      transformed.z += elevation; 
      
      vElevation = elevation;
      
      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 baseColor;
    uniform vec3 peakColor;
    uniform float opacity;
    varying float vElevation;
    
    void main() {
      float mixStrength = (vElevation + 0.1) * 5.0;
      vec3 color = mix(baseColor, peakColor, clamp(mixStrength, 0.0, 1.0));
      
      gl_FragColor = vec4(color, opacity);
    }
  `
};
