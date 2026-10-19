import * as THREE from 'three';

export interface PixelSettings {
  width: number;
  height: number;
  posterize: boolean;
  outline: boolean;
}

const DEFAULTS: PixelSettings = { width: 320, height: 180, posterize: false, outline: false };

export function loadSettings(): PixelSettings {
  try {
    const raw = localStorage.getItem('ptk_settings');
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: PixelSettings): void {
  localStorage.setItem('ptk_settings', JSON.stringify(s));
}

export class PixelPipeline {
  settings: PixelSettings;
  target: THREE.WebGLRenderTarget;
  quadScene: THREE.Scene;
  quadCamera: THREE.OrthographicCamera;
  quadMesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;

  constructor(settings?: PixelSettings) {
    this.settings = settings ?? loadSettings();
    this.target = new THREE.WebGLRenderTarget(this.settings.width, this.settings.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
    });
    this.target.texture.minFilter = THREE.NearestFilter;
    this.target.texture.magFilter = THREE.NearestFilter;
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.material = new THREE.MeshBasicMaterial({ map: this.target.texture });
    const geo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(geo, this.material);
    this.quadScene.add(this.quadMesh);
  }

  resize(w: number, h: number): void {
    this.settings.width = w;
    this.settings.height = h;
    this.target.setSize(w, h);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    this.material.map = this.target.texture;
    this.material.needsUpdate = true;
    renderer.render(this.quadScene, this.quadCamera);
  }
}