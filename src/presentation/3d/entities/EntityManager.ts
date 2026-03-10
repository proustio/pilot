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
  private waterMaterialUniforms: any = null;
  private particleSystem: ParticleSystem;
  private currentRippleIndex: number = 0;

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

    // Create a large visible plane for the "water surface" underneath everything
    const waterGeometry = new THREE.PlaneGeometry(50, 50, 64, 64);
    const waterMaterial = new THREE.ShaderMaterial({
      vertexShader: WaterShader.vertexShader,
      fragmentShader: WaterShader.fragmentShader,
      uniforms: {
        time: { value: 0 },
        baseColor: { value: new THREE.Color(0x1E90FF) },
        peakColor: { value: new THREE.Color(0x87CEFA) },
        opacity: { value: 0.9 },
        globalTurbulence: { value: 0.0 },
        rippleCenters: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
        rippleTimes: { value: [0.0, 0.0, 0.0, 0.0, 0.0] }
      },
      transparent: true,
      side: THREE.FrontSide
    });
    this.waterMaterialUniforms = waterMaterial.uniforms;
    const waterPlane = new THREE.Mesh(waterGeometry, waterMaterial);
    waterPlane.rotation.x = -Math.PI / 2;
    waterPlane.position.y = -1.0; // Deep below the board
    waterPlane.receiveShadow = false; // ShaderMaterial needs extra work for shadows, disabled for stylized look
    this.scene.add(waterPlane);

    // Create the "Master Wood Board"
    const woodGeo = new THREE.BoxGeometry(10.5, 0.6, 10.5);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    const woodBlock = new THREE.Mesh(woodGeo, woodMat);
    woodBlock.castShadow = true;
    woodBlock.receiveShadow = true;
    this.masterBoardGroup.add(woodBlock);

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
  
  private addRipple(worldX: number, worldZ: number) {
      if (this.waterMaterialUniforms) {
          this.waterMaterialUniforms.rippleCenters.value[this.currentRippleIndex].set(worldX, -worldZ);
          this.waterMaterialUniforms.rippleTimes.value[this.currentRippleIndex] = 0.01;
          this.currentRippleIndex = (this.currentRippleIndex + 1) % 5;
      }
  }

  public update() {
      // Smoothly lerp board rotation
      const actualFlipSpeed = Config.timing.boardFlipSpeed * Config.timing.gameSpeedMultiplier;
      this.masterBoardGroup.rotation.x += (this.targetRotationX - this.masterBoardGroup.rotation.x) * actualFlipSpeed;
      
      // Update water shader time and ripples
      const waterTimeIncrement = 0.016 * Config.timing.gameSpeedMultiplier;
      this.time += waterTimeIncrement;
      if (this.waterMaterialUniforms) {
          this.waterMaterialUniforms.time.value = this.time;
          for (let i = 0; i < 5; i++) {
              if (this.waterMaterialUniforms.rippleTimes.value[i] > 0) {
                  this.waterMaterialUniforms.rippleTimes.value[i] += waterTimeIncrement;
                  if (this.waterMaterialUniforms.rippleTimes.value[i] > (2.0 / Config.timing.gameSpeedMultiplier)) {
                      this.waterMaterialUniforms.rippleTimes.value[i] = 0; // Stop
                  }
              }
          }
          if (this.waterMaterialUniforms.globalTurbulence.value > 0) {
              this.waterMaterialUniforms.globalTurbulence.value = Math.max(0, this.waterMaterialUniforms.globalTurbulence.value - waterTimeIncrement * 0.2);
          }
      }
      
      this.particleSystem.update();
      
      // Animate falling markers
      for (let i = this.fallingMarkers.length - 1; i >= 0; i--) {
          const m = this.fallingMarkers[i];
          m.progress += Config.timing.projectileSpeed * Config.timing.gameSpeedMultiplier; // Adjust speed here
          
          if (m.progress >= 1.0) {
              m.progress = 1.0;
              m.mesh.position.copy(m.curve.getPoint(1.0));
              
              if (m.result === 'hit' || m.result === 'sunk') {
                  const targetGroup = m.isPlayer ? this.enemyBoardGroup : this.playerBoardGroup;
                  
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
          this.addRipple(worldX, worldZ);
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
    this.addRipple(worldX, worldZ);
    if (result === 'sunk' && this.waterMaterialUniforms) {
        this.waterMaterialUniforms.globalTurbulence.value = 0.4;
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
