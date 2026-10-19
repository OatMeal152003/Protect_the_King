import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  group: THREE.Group; // root for board+pieces
}

export function createScene(canvas: HTMLCanvasElement): SceneContext | null {
  // WebGL availability check
  try {
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!ctx) return null;
  } catch { return null; }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(1); // pixel pipeline handled in Step 2; keep 1 for now
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a0a12);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 12, 14);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 8;
  controls.maxDistance = 30;

  // flat lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  const group = new THREE.Group();
  scene.add(group);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, group };
}

export function renderLoop(ctx: SceneContext, onFrame?: () => void): void {
  const animate = () => {
    requestAnimationFrame(animate);
    ctx.controls.update();
    if (onFrame) onFrame();
    ctx.renderer.render(ctx.scene, ctx.camera);
  };
  animate();
}