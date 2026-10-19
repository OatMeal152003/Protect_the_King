import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PixelPipeline, loadSettings } from './pixel';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  group: THREE.Group;
  pixel: PixelPipeline;
  resetView: (blackSide?: boolean) => void;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext | null {
  try {
    const c = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!c) return null;
  } catch { return null; }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a0a12);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 14, 16);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 10;
  controls.maxDistance = 32;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dir = new THREE.DirectionalLight(0xffffff, 0.5);
  dir.position.set(6, 12, 6);
  scene.add(dir);

  const group = new THREE.Group();
  scene.add(group);

  const pixel = new PixelPipeline(loadSettings());

  const resetView = (blackSide = false) => {
    if (blackSide) {
      camera.position.set(0, 14, -16);
    } else {
      camera.position.set(0, 14, 16);
    }
    controls.target.set(0, 0, 0);
    controls.update();
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, group, pixel, resetView };
}

export function renderLoop(ctx: SceneContext, onFrame?: () => void): void {
  const animate = () => {
    requestAnimationFrame(animate);
    ctx.controls.update();
    if (onFrame) onFrame();
    ctx.pixel.render(ctx.renderer, ctx.scene, ctx.camera);
  };
  animate();
}