import * as THREE from 'three';
import { Ship, Orientation } from '../../../domain/fleet/Ship';
import { WaterShader } from '../materials/WaterShader';
import { ParticleSystem } from './ParticleSystem';
import { Config } from '../../../infrastructure/config/Config';

export class EntityManager {
  private scene: THREE.Scene;
  
  public masterBoardGroup: THREE.Group;
  private playerBoardGroup: THREE.Group;
  private enemyBoardGroup: THREE.Group;
  
  private targetRotationX: number = 0;
  
  private lastAttackMarker: THREE.Mesh | null = null;
  private fallingMarkers: { mesh: THREE.Mesh, curve: THREE.QuadraticBezierCurve3, progress: number, worldX: number, worldZ: number, result: string, isPlayer: boolean, cellX: number, cellZ: number }[] = [];
  
  private time: number = 0;
  private playerWaterUniforms: any = null;
  private enemyWaterUniforms: any = null;
  
  private playerRippleIndex: number = 0;
  private enemyRippleIndex: number = 0;
  
  private particleSystem: ParticleSystem;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    this.masterBoardGroup = new THREE.Group();
    this.playerBoardGroup = new THREE.Group();
    this.enemyBoardGroup = new THREE.Group();
    
    this.particleSystem = new ParticleSystem();
    
    // Position faces: Player points UP, Enemy points DOWN
    this.playerBoardGroup.position.y = 0.3; 
    
    this.enemyBoardGroup.position.y = -0.3;
    this.enemyBoardGroup.rotation.x = Math.PI; // Flipped upside down
    
    this.masterBoardGroup.add(this.playerBoardGroup);
    this.masterBoardGroup.add(this.enemyBoardGroup);
    this.scene.add(this.masterBoardGroup);

    this.createBoardMeshes();

    // Removed disconnected SET_FLIP_SPEED listener
  }

  private createBoardMeshes() {
    const boardSize = 10;
    const offset = boardSize / 2;

    const createWaterUniforms = () => ({
      time: { value: 0 },
      baseColor: { value: new THREE.Color(0x1E90FF) },
      peakColor: { value: new THREE.Color(0x87CEFA) },
      opacity: { value: 0.9 },
      globalTurbulence: { value: 0.0 },
      rippleCenters: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
      rippleTimes: { value: [0.0, 0.0, 0.0, 0.0, 0.0] }
    });

    // Create the "Master Wood Frame" (hollow inside)
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    
    const borders = [
        { x: 11, z: 0.5, posZ: -5.25, posX: 0 },  // Top
        { x: 11, z: 0.5, posZ: 5.25, posX: 0 },   // Bottom
        { x: 0.5, z: 10, posZ: 0, posX: -5.25 },   // Left
        { x: 0.5, z: 10, posZ: 0, posX: 5.25 }     // Right
    ];

    borders.forEach(b => {
        const borderGeo = new THREE.BoxGeometry(b.x, 0.6, b.z);
        const borderMesh = new THREE.Mesh(borderGeo, woodMat);
        borderMesh.position.set(b.posX, 0, b.posZ);
        borderMesh.castShadow = true;
        borderMesh.receiveShadow = true;
        this.masterBoardGroup.add(borderMesh);
    });

    // Create water panes for the boards
    const boardWaterGeo = new THREE.PlaneGeometry(10, 10, 32, 32);
    
    this.playerWaterUniforms = createWaterUniforms();
    const playerWaterMat = new THREE.ShaderMaterial({
      vertexShader: WaterShader.vertexShader,
      fragmentShader: WaterShader.fragmentShader,
      uniforms: this.playerWaterUniforms,
      transparent: true,
      side: THREE.FrontSide
    });
    const playerWaterPlane = new THREE.Mesh(boardWaterGeo, playerWaterMat);
    playerWaterPlane.rotation.x = -Math.PI / 2;
    playerWaterPlane.position.y = -0.25; // Slightly recessed from top
    playerWaterPlane.receiveShadow = true;
    this.playerBoardGroup.add(playerWaterPlane);

    this.enemyWaterUniforms = createWaterUniforms();
    const enemyWaterMat = new THREE.ShaderMaterial({
      vertexShader: WaterShader.vertexShader,
      fragmentShader: WaterShader.fragmentShader,
      uniforms: this.enemyWaterUniforms,
      transparent: true,
      side: THREE.FrontSide
    });
    const enemyWaterPlane = new THREE.Mesh(boardWaterGeo, enemyWaterMat);
    enemyWaterPlane.rotation.x = -Math.PI / 2;
    enemyWaterPlane.position.y = -0.25; // Slightly recessed
    enemyWaterPlane.receiveShadow = true;
    this.enemyBoardGroup.add(enemyWaterPlane);

    // Create interactable grid tiles (invisible or somewhat transparent borders)
    const tileGeometry = new THREE.BoxGeometry(0.95, 0.1, 0.95);
    const tilePlayerMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, transparent: true, opacity: 0.2, depthWrite: false });
    const tileEnemyMat = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.2, depthWrite: false });

    for (let x = 0; x < boardSize; x++) {
      for (let z = 0; z < boardSize; z++) {
        const worldX = x - offset + 0.5;
        const worldZ = z - offset + 0.5;
        
        // Player Side tile
        const ptile = new THREE.Mesh(tileGeometry, tilePlayerMat);
        ptile.position.set(worldX, 0, worldZ);
        ptile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: true };
        this.playerBoardGroup.add(ptile);

        // Enemy Side tile
        const etile = new THREE.Mesh(tileGeometry, tileEnemyMat);
        etile.position.set(worldX, 0, worldZ);
        etile.userData = { isGridTile: true, cellX: x, cellZ: z, isPlayerSide: false };
        this.enemyBoardGroup.add(etile);
      }
    }
    
    // GridHelpers for visual debug
    const pGrid = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
    pGrid.position.y = 0.05;
    pGrid.material.transparent = true; pGrid.material.opacity = 0.5;
    this.playerBoardGroup.add(pGrid);

    const eGrid = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
    eGrid.position.y = 0.05;
    eGrid.material.transparent = true; eGrid.material.opacity = 0.5;
    this.enemyBoardGroup.add(eGrid);
  }

  /**
   * Returns the list of objects that the Raycaster should test against.
   * Only returns the tiles that are currently facing UP.
   */
  public getInteractableObjects(): THREE.Object3D[] {
    // Determine which side is facing up by looking at rotation
    // Math.PI rotation means enemy board is UP
    const isEnemyUp = Math.abs(this.masterBoardGroup.rotation.x - Math.PI) < 0.1;
    if (isEnemyUp) {
        return this.enemyBoardGroup.children.filter(c => c.userData.isGridTile);
    }
    return this.playerBoardGroup.children.filter(c => c.userData.isGridTile);
  }

  public showPlayerBoard() {
    this.targetRotationX = 0;
  }

  public showEnemyBoard() {
    this.targetRotationX = Math.PI;
  }
  
  private addRipple(worldX: number, worldZ: number, isPlayerBoard: boolean) {
      const uniforms = isPlayerBoard ? this.playerWaterUniforms : this.enemyWaterUniforms;
      let rIndex = isPlayerBoard ? this.playerRippleIndex : this.enemyRippleIndex;
      
      if (uniforms) {
          uniforms.rippleCenters.value[rIndex].set(worldX, -worldZ);
          uniforms.rippleTimes.value[rIndex] = 0.01;
          rIndex = (rIndex + 1) % 5;
          
          if (isPlayerBoard) this.playerRippleIndex = rIndex;
          else this.enemyRippleIndex = rIndex;
      }
  }

  public update() {
      // Smoothly lerp board rotation
      const actualFlipSpeed = Config.timing.boardFlipSpeed * Config.timing.gameSpeedMultiplier;
      this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * actualFlipSpeed;
      
      // Update water shader time and ripples
      const waterTimeIncrement = 0.016 * Config.timing.gameSpeedMultiplier;
      this.time += waterTimeIncrement;
      
      const updateWater = (uniforms: any) => {
          if (!uniforms) return;
          uniforms.time.value = this.time;
          for (let i = 0; i < 5; i++) {
              if (uniforms.rippleTimes.value[i] > 0) {
                  uniforms.rippleTimes.value[i] += waterTimeIncrement;
                  if (uniforms.rippleTimes.value[i] > (2.0 / Config.timing.gameSpeedMultiplier)) {
                      uniforms.rippleTimes.value[i] = 0; // Stop
                  }
              }
          }
          if (uniforms.globalTurbulence.value > 0) {
              uniforms.globalTurbulence.value = Math.max(0, uniforms.globalTurbulence.value - waterTimeIncrement * 0.2);
          }
      };

      updateWater(this.playerWaterUniforms);
      updateWater(this.enemyWaterUniforms);
      
      this.particleSystem.update();
      
      // Animate falling markers
      for (let i = this.fallingMarkers.length - 1; i >= 0; i--) {
          const m = this.fallingMarkers[i];
          m.progress += Config.timing.projectileSpeed * Config.timing.gameSpeedMultiplier; // Adjust speed here
          
          if (m.progress >= 1.0) {
              m.progress = 1.0;
              m.mesh.position.copy(m.curve.getPoint(1.0));
              
              const targetGroup = m.isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;
              
              // Always spawn water splash on impact (hit or miss)
              this.particleSystem.spawnSplash(m.worldX, 0.2, m.worldZ, targetGroup);

              if (m.result === 'hit' || m.result === 'sunk') {
                  
                  // Spawn explosion
                  this.particleSystem.spawnExplosion(m.worldX, 0.4, m.worldZ, targetGroup);
                  // Start emitter
                  // const emitterSpeedMultiplier = Config.timing.gameSpeedMultiplier; // Pass this along if particle system gets updated, assuming it uses fixed time for now
                  this.particleSystem.addEmitter(m.worldX, 0.4, m.worldZ, m.result === 'sunk', targetGroup);
                  
                  // Hide ship segment if it's on the player board (enemy ships are hidden initially)
                  if (!m.isPlayer) {
                      this.playerBoardGroup.children.forEach(child => {
                          if (child.userData.isShipBlock && child.userData.cx === m.cellX && child.userData.cz === m.cellZ) {
                              child.visible = false;
                          }
                      });
                  }
              }
              this.fallingMarkers.splice(i, 1);
          } else {
              m.mesh.position.copy(m.curve.getPoint(m.progress));
              // point it towards velocity vector
              const tangent = m.curve.getTangent(m.progress);
              m.mesh.lookAt(m.mesh.position.clone().add(tangent));
          }
      }
  }

  public addShip(ship: Ship, x: number, z: number, orientation: Orientation, isPlayer: boolean) {
    if (!isPlayer) return; // Hide enemy ships

    const targetGroup = this.playerBoardGroup; // Player ships go on player board

    const shipMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.7,
    });

    for (let i = 0; i < ship.size; i++) {
      const cx = orientation === Orientation.Horizontal ? x + i : x;
      const cz = orientation === Orientation.Vertical ? z + i : z;
      
      const boxG = new THREE.BoxGeometry(0.8, 0.4, 0.8);
      const block = new THREE.Mesh(boxG, shipMaterial);
      block.userData = { isShipBlock: true, cx, cz };
      
      const worldX = cx - 5 + 0.5;
      const worldZ = cz - 5 + 0.5;
      
      block.position.set(worldX, 0.2, worldZ);
      block.castShadow = true;
      block.receiveShadow = true;
      targetGroup.add(block);
      
      if (i === Math.floor(ship.size / 2)) {
          this.addRipple(worldX, worldZ, true); // Player ships go on player board
      }
    }
  }

  public addAttackMarker(x: number, z: number, result: string, isPlayer: boolean) {
    // If the player fired the shot, it lands on the enemy board. If the enemy fired, it lands on the player board.
    const targetGroup = isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;

    // Revert previous last attack marker to its original color
    if (this.lastAttackMarker) {
        const originalMat = this.lastAttackMarker.userData.originalMat as THREE.MeshStandardMaterial;
        this.lastAttackMarker.material = originalMat;
    }

    let originalColor = 0xffffff; // Miss -> white
    if (result === 'hit' || result === 'sunk') {
      originalColor = 0xff0000; // Hit -> red
    }

    const originalMat = new THREE.MeshStandardMaterial({ color: originalColor, roughness: 0.5 });
    // Active yellow material
    const activeMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.2, emissive: 0x888800 });

    const geo = new THREE.BoxGeometry(0.4, 0.6, 0.4);
    const marker = new THREE.Mesh(geo, activeMat);
    marker.userData = { originalMat }; // Save original material for later

    const worldX = x - 5 + 0.5;
    const worldZ = z - 5 + 0.5;
    
    const targetLocalPos = new THREE.Vector3(worldX, 0.4, worldZ);
    
    // Find a random friendly ship block to start from
    const sourceGroup = isPlayer ? this.playerBoardGroup : this.enemyBoardGroup;
    let startPos = new THREE.Vector3((Math.random() - 0.5) * 10, 5, (Math.random() - 0.5) * 10);
    
    const friendlyBlocks: THREE.Mesh[] = [];
    sourceGroup.children.forEach(c => {
        if (c.userData.isShipBlock && c.visible) friendlyBlocks.push(c as THREE.Mesh);
    });
    
    if (friendlyBlocks.length > 0) {
        const randomBlock = friendlyBlocks[Math.floor(Math.random() * friendlyBlocks.length)];
        randomBlock.getWorldPosition(startPos);
        targetGroup.worldToLocal(startPos); // Convert to targetGroup's local space
    } else {
        // Fallback if no ships visible
        startPos.set(0, 10, 0);
    }
    
    // Control point for parabolic arc
    const midPoint = new THREE.Vector3().addVectors(startPos, targetLocalPos).multiplyScalar(0.5);
    midPoint.y += 5.0; // Arch up by 5 units
    
    const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, targetLocalPos);
    
    marker.position.copy(startPos);
    targetGroup.add(marker);
    
    // Trigger water ripple
    this.addRipple(worldX, worldZ, !isPlayer); // If player fired, it lands on enemy board
    
    if (result === 'sunk') {
        const targetUniforms = isPlayer ? this.enemyWaterUniforms : this.playerWaterUniforms;
        if (targetUniforms) {
            targetUniforms.globalTurbulence.value = 0.4;
        }
    }
    
    this.fallingMarkers.push({ 
        mesh: marker, 
        curve: curve,
        progress: 0,
        worldX, 
        worldZ, 
        result, 
        isPlayer, 
        cellX: x, 
        cellZ: z 
    });
    this.lastAttackMarker = marker;
  }
}
