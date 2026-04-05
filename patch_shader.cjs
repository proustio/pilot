const fs = require('fs');
let vert = fs.readFileSync('src/presentation/3d/shaders/Particle.vert', 'utf8');

vert = vert.replace(/vec3 animatedPos = vec3\(0\.0\);/g, 'vec3 animatedPos = vec3(0.0);\n    float fpsScale = 60.0;\n');
vert = vert.replace(/animatedPos = instanceVelocity \* age;/g, 'animatedPos = instanceVelocity * (age * fpsScale);');
vert = vert.replace(/vec3 vel = instanceVelocity;/g, 'vec3 vel = instanceVelocity * fpsScale;');
vert = vert.replace(/vel\.y -= 0\.5 \* age;/g, 'vel.y -= 0.5 * fpsScale * age;');

fs.writeFileSync('src/presentation/3d/shaders/Particle.vert', vert);
