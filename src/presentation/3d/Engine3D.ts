import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Config } from '../../infrastructure/config/Config';
export class Engine3D {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  
  public targetCameraPos = new THREE.Vector3(0, 12, 12);
  public targetLookAt = new THREE.Vector3(0, 0, 0);
  private currentLookAt = new THREE.Vector3(0, 0, 0);
  
  public orbitControls!: OrbitControls;
  private isTransitioning: boolean = false;
  
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  
  private container: HTMLElement;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found.`);
    this.container = el;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB'); // Sky blue background

    // 2. Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    // Position camera at an isometric-like angle looking down at origin
    this.camera.position.set(0, 12, 12);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.container.appendChild(this.renderer.domElement);

    // 4. Lighting
    this.setupLighting();

    // 5. Initial Time of Day
    this.setDayMode(Config.visual.isDayMode);

    // 6. OrbitControls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't allow going below the board
    this.orbitControls.minDistance = 5;
    this.orbitControls.maxDistance = 30;
    this.orbitControls.target.copy(this.targetLookAt);
    
    // Custom logic to require CTRL/CMD for panning
    this.renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
      // Allow rotating without modifiers, require panning to have ctrl or meta
      if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
        // Force Right Click (Pan) behavior for Left-Click + Ctrl/CMD
        this.orbitControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        this.orbitControls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE; // Swap them
      } else {
        // Default behavior (Left = Rotate, Right = Pan)
        this.orbitControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.orbitControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      }
    }, { capture: true }); // Use capture so it executes before OrbitControls handles the event

    // Listen for Day/Night toggle
    document.addEventListener('TOGGLE_DAY_NIGHT', (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail && customEvent.detail.isDay !== undefined) {
            this.setDayMode(customEvent.detail.isDay);
        }
    });

    // Listen for Camera Auto-Lerp from GameLoop
    document.addEventListener('SET_CAMERA_TARGET', (e: Event) => {
        const ce = e as CustomEvent;
        if (ce.detail && !this.isTransitioning) {
            this.targetCameraPos.set(ce.detail.x, ce.detail.y, ce.detail.z);
            this.isTransitioning = true;
        }
    });

    // Resize Handler
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private setupLighting() {
    // Ambient Light - base illumination everywhere
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    // Directional Light - mimics sun, casts shadows
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    // Position sun somewhat diagonally
    this.dirLight.position.set(10, 20, 10);
    this.dirLight.castShadow = true;
    
    // Configure shadow frustum size (cover the board)
    this.dirLight.shadow.camera.top = 25;
    this.dirLight.shadow.camera.bottom = -25;
    this.dirLight.shadow.camera.left = -25;
    this.dirLight.shadow.camera.right = 25;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 50;
    // Map size for shadow resolution
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;

    this.scene.add(this.dirLight);

    // Add optional hemisphere light for slightly better color grading
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    this.hemiLight.position.set(0, 20, 0);
    this.scene.add(this.hemiLight);
  }

  public setDayMode(isDay: boolean) {
      if (isDay) {
          // Daytime Theme
          this.scene.background = new THREE.Color('#87CEEB'); // Sky blue
          this.ambientLight.color.setHex(0xffffff);
          this.ambientLight.intensity = 0.4;
          
          this.dirLight.color.setHex(0xffffff);
          this.dirLight.intensity = 1.2;
          
          this.hemiLight.intensity = 0.4;
      } else {
          // Nighttime Theme
          this.scene.background = new THREE.Color('#0A0A2A'); // Deep dark navy
          this.ambientLight.color.setHex(0xaaaaaa);
          this.ambientLight.intensity = 0.15; // Dimmer ambient
          
          this.dirLight.color.setHex(0x88bbff); // Moonlight blue tint
          this.dirLight.intensity = 0.5; // Weaker directional light
          
          this.hemiLight.intensity = 0.1; // Very weak fill
      }
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }


  public render() {
    const cameraSpeed = Config.timing.cameraLerpSpeed * Config.timing.gameSpeedMultiplier;
    const safeLerp = Math.min(cameraSpeed, 1.0);
    
    if (this.isTransitioning) {
      this.orbitControls.enabled = false;
      this.camera.position.lerp(this.targetCameraPos, safeLerp);
      this.currentLookAt.lerp(this.targetLookAt, safeLerp);
      this.orbitControls.target.copy(this.currentLookAt);
      this.camera.lookAt(this.currentLookAt);
      
      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.1 &&
          this.currentLookAt.distanceTo(this.targetLookAt) < 0.1) {
        this.isTransitioning = false;
        this.orbitControls.enabled = true;
        this.orbitControls.enableRotate = true;
      }
    } else {
      this.orbitControls.enableRotate = true;
      this.orbitControls.update();
      this.currentLookAt.copy(this.orbitControls.target);
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}
