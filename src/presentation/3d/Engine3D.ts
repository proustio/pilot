import * as THREE from 'three';

export class Engine3D {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  
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
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    // Position camera at an isometric-like angle looking down at origin
    this.camera.position.set(0, 15, 15);
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

    // Resize Handler
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private setupLighting() {
    // Ambient Light - base illumination everywhere
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Directional Light - mimics sun, casts shadows
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    // Position sun somewhat diagonally
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    
    // Configure shadow frustum size (cover the board)
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    // Map size for shadow resolution
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;

    this.scene.add(dirLight);

    // Add optional hemisphere light for slightly better color grading
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public render() {
    this.renderer.render(this.scene, this.camera);
  }
}
