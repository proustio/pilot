import * as THREE from 'three';
import { InteractivityGuard } from '../InteractivityGuard';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Config } from '../../infrastructure/config/Config';
import { ThemeManager } from '../theme/ThemeManager';
import { eventBus, GameEventType } from '../../application/events/GameEventBus';
export class Engine3D {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public targetCameraPos = new THREE.Vector3(5.0233, 10.0466, 14.0652); // Exact dist 18 from origin
  public targetLookAt = new THREE.Vector3(0, 0, 0);
  private currentLookAt = new THREE.Vector3(0, 0, 0);

  public orbitControls!: OrbitControls;
  public isTransitioning: boolean = false;
  public hasManualMovement: boolean = false;


  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;

  private container: HTMLElement;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found.`);
    this.container = el;

    this.scene = new THREE.Scene();
    this.scene.background = ThemeManager.getInstance().getBackgroundColor();

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(5.0233, 10.0466, 14.0652);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ 
        antialias: Config.visual.antialias, 
        alpha: true,
        powerPreference: 'high-performance',
        precision: 'highp'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = Config.visual.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.updateTheme();

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.orbitControls.minDistance = 5;
    this.orbitControls.maxDistance = 30;
    this.orbitControls.target.copy(this.targetLookAt);

    this.orbitControls.addEventListener('change', () => {
      if (!this.isTransitioning) {
        this.hasManualMovement = true;
        
        // Debounced camera save
        if (!InteractivityGuard.isCameraMoving()) {
            this.triggerDebouncedSave();
        }
      }
    });

    this.orbitControls.addEventListener('start', () => {

      InteractivityGuard.setCameraInteracting(true);
    });
    this.orbitControls.addEventListener('end', () => {
      InteractivityGuard.setCameraInteracting(false);
      this.triggerDebouncedSave();
    });

    this.renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
      // Camera Rotation Guard: 
      // Camera orbit rotation should only work if we initially click on empty space around the board.
      // Disable rotation if cursor is over the Battlefield or HUD.

      const isBattlefieldHovered = (window as any).isHoveringBattlefield;
      const isHUDHovered = InteractivityGuard.isPointerOverUI(event.clientX, event.clientY);

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

    eventBus.on(GameEventType.TOGGLE_DAY_NIGHT, () => {
        this.setDayMode(!Config.visual.isDayMode);
    });

    eventBus.on(GameEventType.SET_CAMERA_TARGET, (payload: any) => {
        if (payload && !this.isTransitioning) {
            this.targetCameraPos.set(payload.x, payload.y, payload.z);
            this.isTransitioning = true;
            InteractivityGuard.setCameraTransitioning(true);
        }
    });

    eventBus.on(GameEventType.THEME_CHANGED, () => {
      this.updateTheme();
    });

    eventBus.on(GameEventType.RESET_CAMERA, () => {
      this.targetCameraPos.set(5.0233, 10.0466, 14.0652);
      this.targetLookAt.set(0, 0, 0);
      this.isTransitioning = true;
      InteractivityGuard.setCameraTransitioning(true);
    });

    eventBus.on(GameEventType.WINDOW_RESIZE, () => {
        this.onWindowResize();
    });
  }

  private setupLighting() {
    // Holographic/Sci-Fi Lighting Setup
    this.ambientLight = new THREE.AmbientLight(0x4169E1, 0.3); // Cool Royal Blue ambient base
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xFFD700, 0.8); // Gold directional light for highlights
    this.dirLight.position.set(10, 20, 10);
    this.dirLight.castShadow = Config.visual.shadowsEnabled;

    this.dirLight.shadow.camera.top = 12;
    this.dirLight.shadow.camera.bottom = -12;
    this.dirLight.shadow.camera.left = -12;
    this.dirLight.shadow.camera.right = 12;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.mapSize.width = 512;
    this.dirLight.shadow.mapSize.height = 512;

    this.scene.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight(0xFFFFFF, 0x000080, 0.4); // White top, Navy bottom
    this.hemiLight.position.set(0, 20, 0);
    this.scene.add(this.hemiLight);

    // Add a point light to emphasize the "glowing hologram" effect from the center
    const pointLight = new THREE.PointLight(0x4169E1, 1.0, 50);
    pointLight.position.set(0, 5, 0);
    this.scene.add(pointLight);
  }

  public setDayMode(_isDay: boolean) {
    this.updateTheme();
  }

  public updateTheme() {
    const tm = ThemeManager.getInstance();
    
    this.scene.background = tm.getBackgroundColor();
    
    if (this.scene.fog) {
        this.scene.fog.color = tm.getFogColor();
    }

    this.ambientLight.color.copy(tm.getAmbientLightColor());
    this.ambientLight.intensity = Config.visual.isDayMode ? 0.6 : 0.3;

    this.dirLight.color.copy(tm.getDirectionalLightColor());
    this.dirLight.intensity = Config.visual.isDayMode ? 1.0 : 0.8;

    this.hemiLight.groundColor.copy(tm.getBackgroundColor());
    this.hemiLight.intensity = Config.visual.isDayMode ? 0.6 : 0.4;
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public restoreViewState(
    camX: number, camY: number, camZ: number,
    tgtX: number, tgtY: number, tgtZ: number,
    camDist?: number
  ) {
    this.targetCameraPos.set(camX, camY, camZ);
    this.targetLookAt.set(tgtX, tgtY, tgtZ);
    
    if (camDist !== undefined) {
        // If distance is provided, we might want to adjust the targetCameraPos 
        // to maintain that distance along the vector.
        // For simplicity, we'll just set the min/max distance or trust the position.
        this.orbitControls.minDistance = Math.min(this.orbitControls.minDistance, camDist);
        this.orbitControls.maxDistance = Math.max(this.orbitControls.maxDistance, camDist);
    }
    
    this.isTransitioning = true;
    InteractivityGuard.setCameraTransitioning(true);
  }

  public getCameraState() {
    return {
        pos: this.camera.position.clone(),
        tgt: this.orbitControls.target.clone(),
        dist: this.orbitControls.getDistance()
    };
  }

  private saveTimeout: any = null;
  private triggerDebouncedSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
        if (!InteractivityGuard.isCameraMoving() && !this.isTransitioning) {
            eventBus.emit(GameEventType.TRIGGER_AUTO_SAVE, undefined as any);
        }
    }, 1000);
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
        InteractivityGuard.setCameraTransitioning(false);
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
