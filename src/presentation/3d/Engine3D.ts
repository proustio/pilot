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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB');

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(0, 12, 12);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
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
    
    this.renderer.domElement.addEventListener('pointerdown', (event: PointerEvent) => {
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
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
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

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    this.hemiLight.position.set(0, 20, 0);
    this.scene.add(this.hemiLight);
  }

  public setDayMode(isDay: boolean) {
      if (isDay) {
          this.scene.background = new THREE.Color('#87CEEB');
          this.ambientLight.color.setHex(0xffffff);
          this.ambientLight.intensity = 0.4;
          
          this.dirLight.color.setHex(0xffffff);
          this.dirLight.intensity = 1.2;
          
          this.hemiLight.intensity = 0.4;
      } else {
          this.scene.background = new THREE.Color('#0A0A2A');
          this.ambientLight.color.setHex(0xaaaaaa);
          this.ambientLight.intensity = 0.15;
          
          this.dirLight.color.setHex(0x88bbff);
          this.dirLight.intensity = 0.5;
          
          this.hemiLight.intensity = 0.1;
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
