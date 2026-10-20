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
  let pixelW = settings.width;
  let pixelH = settings.height;
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
  // White plays from the negative-Z side: camera starts there so white is "below".
  camera.position.set(0, 14, -16);
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

  // Smallest camera distance (along the given elevation) that keeps the whole
  // board, including the tallest pieces, inside the frustum. On portrait
  // screens the width is the limiting factor, so the default view has to pull
  // back or the outer files get cropped.
  const fitDistance = (aspect: number, elevation: number): number => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * aspect;
    const margin = 1.06;
    const half = 5.8;
    const top = 2.3;
    const dir = new THREE.Vector3(0, Math.sin(elevation), -Math.cos(elevation));
    const forward = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    for (let dist = 10; dist < 100; dist += 0.25) {
      const cam = dir.clone().multiplyScalar(dist);
      let fits = true;
      for (const x of [-half, half]) {
        for (const z of [-half, half]) {
          for (const y of [0, top]) {
            const p = new THREE.Vector3(x, y, z).sub(cam);
            const zc = p.dot(forward);
            if (zc < 0.25 || Math.abs(p.dot(right)) * margin > zc * tanH || Math.abs(p.dot(up)) * margin > zc * tanV) {
              fits = false;
              break;
            }
          }
          if (!fits) break;
        }
        if (!fits) break;
      }
      if (fits) return dist;
    }
    return 60;
  };

  const resetView = (blackSide = false) => {
    const aspect = camera.aspect;
    const portrait = aspect < 1;
    if (portrait) {
      // Steeper, pulled-back view so all eight files fit on a phone.
      const elevation = THREE.MathUtils.degToRad(66);
      const dist = fitDistance(aspect, elevation);
      controls.maxDistance = Math.max(32, dist * 1.15);
      camera.position.set(0, Math.sin(elevation) * dist, (blackSide ? 1 : -1) * Math.cos(elevation) * dist);
    } else {
      controls.maxDistance = 32;
      if (blackSide) camera.position.set(0, 14, 16);   // black's side (+Z)
      else camera.position.set(0, 14, -16);            // white's side (-Z)
    }
    controls.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    controls.update();
  };

  const applyPixelSize = (w: number, h: number) => {
    pixelW = w;
    pixelH = h;
    if (graphicsMode() === 'smooth') return;
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
      pixelW = s.width;
      pixelH = s.height;
      renderer.setSize(s.width, s.height, false);
      camera.aspect = s.width / s.height;
    }
    camera.updateProjectionMatrix();
  };

  const graphicsMode = (): 'pixel' | 'smooth' => (localStorage.getItem('ptk_gfx') || 'smooth') as 'pixel' | 'smooth';

  // Keep the camera aspect in sync with the viewport. Without this, resizing
  // the window (or rotating a phone) crops the board instead of reframing it.
  let wasPortrait = window.innerWidth < window.innerHeight;
  const onResize = () => {
    if (graphicsMode() === 'smooth') {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
    } else {
      renderer.setSize(pixelW, pixelH, false);
      camera.aspect = pixelW / pixelH;
    }
    camera.updateProjectionMatrix();
    // Crossing the portrait/landscape boundary changes the framing strategy;
    // re-fit so a rotated phone still shows the whole board.
    const portrait = window.innerWidth < window.innerHeight;
    if (portrait !== wasPortrait) {
      wasPortrait = portrait;
      resetView(camera.position.z > 0);
    }
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

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