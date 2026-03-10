export const WaterShader = {
  vertexShader: `
    uniform float time;
    uniform vec2 rippleCenter;
    uniform float rippleTime;
    varying float vElevation;
    void main() {
      vec3 transformed = position;
      
      // Calculate simple undulating waves
      // PlaneGeometry has XY as its standard plane, Z is up (thickness).
      // Since it's rotated -PI/2 in EntityManager, X and Y are our horizontal coordinates
      float elevation = sin(transformed.x * 2.0 + time * 1.5) * 0.15 
                      + sin(transformed.y * 1.5 + time * 1.2) * 0.15;
                      
      // Calculate ripple effect
      float dist = distance(transformed.xy, rippleCenter);
      float ripple = 0.0;
      if (rippleTime > 0.0) {
          float wave = sin((dist - rippleTime * 15.0) * 4.0);
          float attenuation = max(0.0, 1.0 - (dist / 5.0)) * max(0.0, 1.0 - (rippleTime / 2.0));
          float ringFront = max(0.0, 1.0 - abs(dist - rippleTime * 15.0) * 0.2);
          ripple = wave * attenuation * ringFront * 0.5;
      }
      
      elevation += ripple;
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
      // Map elevation (roughly -0.3 to 0.3) to mix strength
      float mixStrength = (vElevation + 0.3) * 1.6; // normalized roughly to [0, 1]
      vec3 color = mix(baseColor, peakColor, clamp(mixStrength, 0.0, 1.0));
      
      gl_FragColor = vec4(color, opacity);
    }
  `
};
