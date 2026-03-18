import * as THREE from 'three';
import { InteractivityGuard } from '../InteractivityGuard';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Config } from '../../infrastructure/config/Config';
export class Engine3D {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public targetCameraPos = new THREE.Vector3(5, 10, 14);
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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#00000a'); // Deep space/Jarvis hologram background
    // Optional: Add some subtle space dust/grid fog to the background
    this.scene.fog = new THREE.FogExp2(0x00000a, 0.02);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(5, 10, 14);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();

    this.setDayMode(Config.visual.isDayMode);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.orbitControls.minDistance = 5;
    this.orbitControls.maxDistance = 30;
    this.orbitControls.target.copy(this.targetLookAt);

    this.orbitControls.addEventListener('start', () => {
      InteractivityGuard.setCameraInteracting(true);
    });
    this.orbitControls.addEventListener('end', () => {
      InteractivityGuard.setCameraInteracting(false);
    });

    this.renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
      // Camera Rotation Guard: 
      // Camera orbit rotation should only work if we initially click on empty space around the board.
      // Disable rotation if cursor is over the Battlefield or HUD.

      const isBattlefieldHovered = (window as any).isHoveringBattlefield;
      
      // Check for HUD (HTML elements with pointer-events: auto)
      const hitElement = document.elementFromPoint(event.clientX, event.clientY);
      const isHUDHovered = hitElement && hitElement.closest('.ui-interactive');

      if (isBattlefieldHovered || isHUDHovered) {
        this.orbitControls.enabled = false;
        // Re-enable after a short delay so normal events aren't permanently blocked
        setTimeout(() => { if (!this.isTransitioning) this.orbitControls.enabled = true; }, 100);
      } else {
        this.orbitControls.enabled = true;
      }

      if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
        this.orbitControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        this.orbitControls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      } else {
        this.orbitControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.orbitControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      }
    }, { capture: true });

    document.addEventListener('TOGGLE_DAY_NIGHT', (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.isDay !== undefined) {
        this.setDayMode(customEvent.detail.isDay);
      }
    });

    document.addEventListener('SET_CAMERA_TARGET', (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail && !this.isTransitioning) {
        this.targetCameraPos.set(ce.detail.x, ce.detail.y, ce.detail.z);
        this.isTransitioning = true;
      }
    });

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private setupLighting() {
    // Holographic/Sci-Fi Lighting Setup
    this.ambientLight = new THREE.AmbientLight(0x4169E1, 0.3); // Cool Royal Blue ambient base
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xFFD700, 0.8); // Gold directional light for highlights
    this.dirLight.position.set(10, 20, 10);
    this.dirLight.castShadow = true;

    this.dirLight.shadow.camera.top = 25;
    this.dirLight.shadow.camera.bottom = -25;
    this.dirLight.shadow.camera.left = -25;
    this.dirLight.shadow.camera.right = 25;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;

    this.scene.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight(0xFFFFFF, 0x000080, 0.4); // White top, Navy bottom
    this.hemiLight.position.set(0, 20, 0);
    this.scene.add(this.hemiLight);

    // Add a point light to emphasize the "glowing hologram" effect from the center
    const pointLight = new THREE.PointLight(0x4169E1, 1.0, 50);
    pointLight.position.set(0, 5, 0);
    this.scene.add(pointLight);
  }

  public setDayMode(isDay: boolean) {
    if (isDay) {
      // Light Mode - Bright Tech Jarvis Vibe
      this.scene.background = new THREE.Color('#f0f4f8');
      if (this.scene.fog) {
        (this.scene.fog as THREE.FogExp2).color.setHex(0xf0f4f8);
      }
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.6;

      this.dirLight.color.setHex(0xffffff);
      this.dirLight.intensity = 1.0;

      this.hemiLight.intensity = 0.6;
    } else {
      // Night Mode - Dark Hologram Jarvis Vibe
      this.scene.background = new THREE.Color('#00000a');
      if (this.scene.fog) {
        (this.scene.fog as THREE.FogExp2).color.setHex(0x00000a);
      }
      this.ambientLight.color.setHex(0x4169E1);
      this.ambientLight.intensity = 0.3;

      this.dirLight.color.setHex(0xFFD700);
      this.dirLight.intensity = 0.8;

      this.hemiLight.intensity = 0.4;
    }
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public restoreViewState(
    camX: number, camY: number, camZ: number,
    tgtX: number, tgtY: number, tgtZ: number
  ) {
    this.targetCameraPos.set(camX, camY, camZ);
    this.targetLookAt.set(tgtX, tgtY, tgtZ);
    this.isTransitioning = true;
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
