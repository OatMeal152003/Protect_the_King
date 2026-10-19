import './style.css';
import * as THREE from 'three';
import { createScene, renderLoop } from './render/scene';
import { loadGLB } from './render/loader';
import { SKINS, piecePath } from './game/skins';
import { startPosition, squareCenter } from './game/board';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const loading = document.getElementById('loading') as HTMLDivElement;
const errorEl = document.getElementById('error') as HTMLDivElement;
const barFill = document.getElementById('bar-fill') as HTMLDivElement;
const loadingText = document.getElementById('loading-text') as HTMLDivElement;

// WebGL check
const ctx = createScene(canvas);
if (!ctx) {
  loading.classList.add('hidden');
  errorEl.classList.remove('hidden');
  throw new Error('WebGL not available');
}

const { group } = ctx;

// Default skin for Step 1
const skin = 'classic';
const skinCfg = SKINS[skin];

ctx.scene.background = new THREE.Color(skinCfg.backgroundColor);

async function loadAll() {
  // 1. Board
  loadingText.textContent = 'Loading board...';
  const board = await loadGLB(skinCfg.boardPath, (p) => {
    barFill.style.width = `${Math.round(p * 60)}%`;
  });
  group.add(board);

  // 2. Pieces
  loadingText.textContent = 'Loading pieces...';
  const pieces = startPosition();
  let done = 0;
  const total = pieces.length;
  for (const sp of pieces) {
    const url = piecePath(skin, sp.color as 'white' | 'black', sp.type as any);
    const mesh = await loadGLB(url);
    const c = squareCenter(sp.i, sp.j);
    mesh.position.set(c.x, c.y, c.z);
    // black faces -Z (rotate 180 around Y); white faces +Z (default)
    if (sp.color === 'black') mesh.rotation.y = Math.PI;
    group.add(mesh);
    done++;
    barFill.style.width = `${60 + Math.round((done / total) * 40)}%`;
  }

  loadingText.textContent = 'Ready';
  barFill.style.width = '100%';
  setTimeout(() => loading.classList.add('hidden'), 300);
}

loadAll().catch((e) => {
  console.error(e);
  loadingText.textContent = 'Failed to load assets. Check console.';
});

renderLoop(ctx);