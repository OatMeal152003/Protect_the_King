import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadSettings } from './pixel';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  group: THREE.Group;
  resetView: (blackSide?: boolean) => void;
  applyPixelSize: (w: number, h: number) => void;
  applyGraphicsMode: (mode: 'pixel' | 'smooth') => void;
  graphicsMode: () => 'pixel' | 'smooth';
}

export function createScene(canvas: HTMLCanvasElement): SceneContext | null {
  try {
    const c = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!c) return null;
  } catch { return null; }

  const settings = loadSettings();
  const smooth = (localStorage.getItem('ptk_gfx') || 'smooth') === 'smooth';
  canvas.style.imageRendering = smooth ? 'auto' : 'pixelated';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: smooth, alpha: false });
  renderer.setPixelRatio(smooth ? Math.min(window.devicePixelRatio, 2) : 1);
  if (smooth) renderer.setSize(window.innerWidth, window.innerHeight, false);
  else renderer.setSize(settings.width, settings.height, false);
  renderer.setClearColor(0x1a1a2e);

  const scene = new THREE.Scene();
  const aspect = smooth ? (window.innerWidth / window.innerHeight) : (settings.width / settings.height);
  const camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 200);
  camera.position.set(0, 14, 16);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 10;
  controls.maxDistance = 32;

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(6, 12, 6);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-6, 8, -6);
  scene.add(fill);

  const group = new THREE.Group();
  scene.add(group);

  const resetView = (blackSide = false) => {
    if (blackSide) camera.position.set(0, 14, -16);
    else camera.position.set(0, 14, 16);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  const applyPixelSize = (w: number, h: number) => {
    if ((localStorage.getItem('ptk_gfx') || 'smooth') === 'smooth') return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const applyGraphicsMode = (mode: 'pixel' | 'smooth') => {
    localStorage.setItem('ptk_gfx', mode);
    canvas.style.imageRendering = mode === 'pixel' ? 'pixelated' : 'auto';
    if (mode === 'smooth') {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
    } else {
      renderer.setPixelRatio(1);
      const s = loadSettings();
      renderer.setSize(s.width, s.height, false);
      camera.aspect = s.width / s.height;
    }
    camera.updateProjectionMatrix();
  };

  const graphicsMode = (): 'pixel' | 'smooth' => (localStorage.getItem('ptk_gfx') || 'smooth') as 'pixel' | 'smooth';

  window.addEventListener('resize', () => {
    // keep pixel resolution; CSS handles display size
  });

  return { scene, camera, renderer, controls, group, resetView, applyPixelSize, applyGraphicsMode, graphicsMode };
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