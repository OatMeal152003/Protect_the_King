import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const gltfLoader = new GLTFLoader();

const cache = new Map<string, THREE.Group>();

export async function loadGLB(url: string, onProgress?: (p: number) => void): Promise<THREE.Group> {
  if (cache.has(url)) return cache.get(url)!.clone(true);
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        const scene = gltf.scene;
        // vertex colors: ensure materials use them
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              (m as any).vertexColors = true;
            }
          }
        });
        cache.set(url, scene);
        resolve(scene.clone(true));
      },
      (xhr) => {
        if (onProgress && xhr.total) onProgress(xhr.loaded / xhr.total);
      },
      (err) => reject(err),
    );
  });
}

export function clearCache(): void { cache.clear(); }