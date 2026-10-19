import './style.css';
import * as THREE from 'three';
import { createScene, renderLoop } from './render/scene';
import { SKINS, SKIN_NAMES } from './game/skins';
import { ChessGame } from './game/chessGame';
import { BoardView } from './render/boardView';
import { showPromotionPicker } from './ui/promotion';
import { Clock } from './game/clock';
import { AI, type Difficulty } from './ai/ai';
import { SFX } from './game/sound';
import { playCapture } from './render/cinematics';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadSettings, saveSettings } from './render/pixel';
import { createAdapter } from './net';
import type { NetAdapter, NetMove } from './net';
// startPosition imported via boardView

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const loading = document.getElementById('loading') as HTMLDivElement;
const errorEl = document.getElementById('error') as HTMLDivElement;
const loadingText = document.getElementById('loading-text') as HTMLDivElement;

// fix id
const barFillEl = document.getElementById('bar-fill') as HTMLDivElement;

const _ctx = createScene(canvas);
if (!_ctx) { loading.classList.add('hidden'); errorEl.classList.remove('hidden'); throw new Error('no webgl'); }
const ctx = _ctx;

let settings = loadSettings();
ctx.applyPixelSize(settings.width, settings.height);

// ---- State ----
type Screen = 'menu' | 'mode' | 'skins' | 'settings' | 'game' | 'gameover';
let screen: Screen = 'menu';
let pieceSkin = localStorage.getItem('ptk_pieceSkin') || 'classic';
let boardSkin = localStorage.getItem('ptk_boardSkin') || 'classic';
let cinematicsMode: 'on' | 'short' | 'off' = (localStorage.getItem('ptk_cine') as any) || 'on';
let volumeOn = localStorage.getItem('ptk_vol') !== '0';

let game: ChessGame | null = null;
let boardView: BoardView | null = null;
let clock: Clock | null = null;
let ai: AI | null = null;
let adapter: NetAdapter | null = null;
let gameMode: 'ai' | 'classic' | 'timed' | 'online' | 'local' = 'classic';
let difficulty: Difficulty = 'medium';
let timedPreset: { min: number; inc: number } = { min: 10, inc: 0 };
let playerColor: 'w' | 'b' = 'w';
let selected: string | null = null;
let gameOver = false;
let paused = false;
let introActive = false;
let remoteMove = false;
let hudInterval: ReturnType<typeof setInterval> | null = null;
// captured tracking (placeholder)
let moveHistory: string[] = [];
let capturedPieces: string[] = [];

// ---- DOM helpers ----
function clearOverlays() { document.querySelectorAll('.overlay').forEach((o) => o.remove()); }
function showToast(msg: string, ms = 3000): void {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:60;padding:10px 18px;background:linear-gradient(180deg,#B52E32,#8E1F22);border:2px solid #C89B42;color:#F2E9D5;font-family:"Jersey 10",monospace;font-size:1rem;letter-spacing:2px;box-shadow:0 4px 16px rgba(0,0,0,0.5);animation:fadeIn 0.2s ease-out;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, ms);
}
function showConfirm(msg: string, onYes: () => void): void {
  const o = overlay(`
    <div class="menu-card">
      <div class="title" style="font-size:1.1rem;">CONFIRM</div>
      <div style="margin:12px 0 18px;font-size:1rem;color:#F2E9D5;text-align:center;">${msg}</div>
      <div style="display:flex;gap:8px;">
        <button data-act="yes">YES</button>
        <button data-act="no">NO</button>
      </div>
    </div>`);
  o.querySelector('[data-act="yes"]')?.addEventListener('click', () => { SFX.click(); clearOverlays(); onYes(); });
  o.querySelector('[data-act="no"]')?.addEventListener('click', () => { SFX.click(); clearOverlays(); });
}
function showAlert(msg: string): void {
  const o = overlay(`
    <div class="menu-card">
      <div class="title" style="font-size:1.1rem;">NOTICE</div>
      <div style="margin:12px 0 18px;font-size:1rem;color:#F2E9D5;text-align:center;">${msg}</div>
      <button data-act="ok">OK</button>
    </div>`);
  o.querySelector('[data-act="ok"]')?.addEventListener('click', () => { SFX.click(); clearOverlays(); });
}
function overlay(html: string): HTMLDivElement {
  clearOverlays();
  const d = document.createElement('div');
  d.className = 'overlay';
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}

// ---- Main Menu ----
function showMenu() {
  screen = 'menu';
  paused = false;
  introActive = false;
  if (ai) { ai.terminate(); ai = null; }
  if (hudInterval) { clearInterval(hudInterval); hudInterval = null; }
  document.querySelectorAll('.game-menu-btn, .game-cam-btn').forEach((e) => e.remove());
  document.getElementById('gamehud')?.remove();
  const o = overlay(`
    <div class="main-menu">
      <div class="menu-layout">
        <div class="left-col">
          <div class="royal-banner">
            <div class="title">PROTECT<br/>THE KING</div>
            <div class="subtitle">A ROYAL CHESS BATTLE</div>
          </div>
          <div class="nav-stack">
            <button class="med-btn" data-act="mode"><span class="icon">&#9812;</span> PLAY CHESS</button>
            <button class="med-btn" data-act="online"><span class="icon">&#9876;</span> ONLINE MULTIPLAYER</button>
            <button class="med-btn" data-act="local"><span class="icon">&#9817;</span> LOCAL MULTIPLAYER</button>
            <button class="med-btn disabled" title="Coming soon"><span class="icon">&#9813;</span> PUZZLES &amp; CHALLENGES</button>
            <button class="med-btn" data-act="skins"><span class="icon">&#9815;</span> SKINS &amp; BOARDS</button>
            <button class="med-btn" data-act="settings"><span class="icon">&#9881;</span> SETTINGS</button>
          </div>
        </div>
        <div class="center-col">
          <button class="begin-quest" data-act="begin">BEGIN YOUR QUEST</button>
        </div>
        <div class="right-col">
          <div class="quick-panel">
            <div class="panel-title">CHOOSE YOUR BATTLE</div>

            <div class="mode-section">
              <div class="mode-name">VS COMPUTER</div>
              <div class="mode-desc">Challenge the royal strategist.</div>
              <div class="mode-options">
                <button class="opt-btn" data-act="ai" data-d="easy">EASY</button>
                <button class="opt-btn" data-act="ai" data-d="medium">MEDIUM</button>
                <button class="opt-btn" data-act="ai" data-d="hard">HARD</button>
                <button class="opt-btn" data-act="ai" data-d="expert">EXPERT</button>
              </div>
            </div>

            <div class="mode-section">
              <div class="mode-name">TIMED MATCH</div>
              <div class="mode-desc">Race against time to claim victory.</div>
              <div class="mode-options">
                <button class="opt-btn action" data-act="timed" data-t="1+0">BULLET</button>
                <button class="opt-btn action" data-act="timed" data-t="3+2">BLITZ</button>
                <button class="opt-btn action" data-act="timed" data-t="10+0">RAPID</button>
                <button class="opt-btn action" data-act="timed" data-t="30+0">CLASSICAL</button>
              </div>
            </div>

            <div class="mode-section">
              <div class="mode-name">LOCAL DUEL</div>
              <div class="mode-desc">Challenge a friend beside you.</div>
              <div class="mode-options">
                <button class="opt-btn action" data-act="local">START LOCAL GAME</button>
              </div>
            </div>

            <div class="mode-section">
              <div class="mode-name">ONLINE MATCH</div>
              <div class="mode-desc">Face challengers across the kingdom.</div>
              <div class="mode-options">
                <button class="opt-btn action" data-act="online-create">FIND MATCH</button>
                <button class="opt-btn action" data-act="online-join">CREATE ROOM</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`);

  o.querySelectorAll('button').forEach((b) => {
    const el = b as HTMLElement;
    const act = el.dataset.act;
    if (!act || act === 'ai' || act === 'timed') return;
    el.addEventListener('click', () => {
      SFX.click();
      if (act === 'mode' || act === 'begin') showModeSelect();
      else if (act === 'online' || act === 'online-create' || act === 'online-join') showOnlineMenu();
      else if (act === 'local') { gameMode = 'local'; playerColor = 'w'; startGame(); }
      else if (act === 'skins') showSkinSelect();
      else if (act === 'settings') showSettings();
    });
  });
  o.querySelectorAll('[data-act="ai"]').forEach((b) => {
    b.addEventListener('click', () => {
      SFX.click();
      const d = (b as HTMLElement).dataset.d as string;
      const diff = d === 'expert' ? 'hard' : d;
      difficulty = diff as any;
      gameMode = 'ai';
      playerColor = 'w';
      startGame();
    });
  });
  o.querySelectorAll('[data-act="timed"]').forEach((b) => {
    b.addEventListener('click', () => {
      SFX.click();
      const t = (b as HTMLElement).dataset.t as string;
      // const [m, inc] = t.split('+');
      if (t === '1+0') timedPreset = { min: 1, inc: 0 };
      else if (t === '3+2') timedPreset = { min: 3, inc: 2 };
      else if (t === '10+0') timedPreset = { min: 10, inc: 0 };
      else if (t === '30+0') timedPreset = { min: 30, inc: 0 };
      gameMode = 'timed';
      playerColor = 'w';
      startGame();
    });
  });
}

function showModeSelect() {
  screen = 'mode';
  const o = overlay(`
    <div class="menu-card">
      <div class="title">SELECT MODE</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button data-mode="ai">VS COMPUTER</button>
        <button data-mode="classic">CLASSIC (UNTIMED)</button>
        <button data-mode="timed">TIMED</button>
        <button data-mode="local">LOCAL PASS-AND-PLAY</button>
        <button data-mode="online">ONLINE (ROOM CODE)</button>
        <button data-act="back">BACK</button>
      </div>
    </div>`);
  o.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    SFX.click();
    const mode = (b as HTMLElement).dataset.mode;
    const act = (b as HTMLElement).dataset.act;
    if (act === 'back') { showMenu(); return; }
    if (mode === 'ai') { showAIDifficulty(); return; }
    if (mode === 'timed') { showTimedSelect(); return; }
    if (mode === 'online') { showOnlineMenu(); return; }
    gameMode = mode as any;
    if (mode === 'local') playerColor = 'w';
    startGame();
  }));
}

function showAIDifficulty() {
  const o = overlay(`
    <div class="menu-card">
      <div class="title">DIFFICULTY</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button data-d="easy">EASY</button>
        <button data-d="medium">MEDIUM</button>
        <button data-d="hard">HARD</button>
        <button data-act="back">BACK</button>
      </div>
    </div>`);
  o.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    SFX.click();
    const d = (b as HTMLElement).dataset.d;
    const act = (b as HTMLElement).dataset.act;
    if (act === 'back') { showModeSelect(); return; }
    difficulty = d as Difficulty;
    gameMode = 'ai';
    playerColor = 'w';
    startGame();
  }));
}

function showTimedSelect() {
  const o = overlay(`
    <div class="menu-card">
      <div class="title">TIMED</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button data-t="3+2">BLITZ 3+2</button>
        <button data-t="10+0">RAPID 10+0</button>
        <button data-t="custom">CUSTOM</button>
        <button data-act="back">BACK</button>
      </div>
    </div>`);
  o.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    SFX.click();
    const t = (b as HTMLElement).dataset.t;
    const act = (b as HTMLElement).dataset.act;
    if (act === 'back') { showModeSelect(); return; }
    if (t === '3+2') timedPreset = { min: 3, inc: 2 };
    else if (t === '10+0') timedPreset = { min: 10, inc: 0 };
    else {
      const m = prompt('Minutes:', '5'); const i = prompt('Increment (sec):', '3');
      timedPreset = { min: parseInt(m || '5'), inc: parseInt(i || '0') };
    }
    gameMode = 'timed';
    playerColor = 'w';
    startGame();
  }));
}

function showOnlineMenu() {
  const o = overlay(`
    <div class="menu-card">
      <div class="title">ONLINE</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <button data-act="create">CREATE ROOM</button>
        <input id="joincode" placeholder="6-CHAR CODE" style="padding:8px;font-family:monospace;text-transform:uppercase;text-align:center;" />
        <button data-act="join">JOIN ROOM</button>
        <button data-act="back">BACK</button>
      </div>
    </div>`);
  o.querySelector('[data-act="create"]')?.addEventListener('click', async () => {
    SFX.click();
    adapter = createAdapter();
    const code = await adapter.createRoom();
    showAlert('Room code: ' + code + ' (share it). Waiting for opponent...');
    gameMode = 'online';
    playerColor = 'w';
    setupOnlineHandlers();
    startGame();
  });
  o.querySelector('[data-act="join"]')?.addEventListener('click', async () => {
    SFX.click();
    const code = (o.querySelector('#joincode') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length < 4) { showAlert('Enter a code'); return; }
    adapter = createAdapter();
    await adapter.joinRoom(code);
    gameMode = 'online';
    playerColor = 'b';
    setupOnlineHandlers();
    startGame();
  });
  o.querySelector('[data-act="back"]')?.addEventListener('click', () => { SFX.click(); showModeSelect(); });
}

function setupOnlineHandlers() {
  if (!adapter) return;
  adapter.onMove((m: NetMove) => {
    if (!game) return;
    const mv = game.move(m.from, m.to, m.promotion);
    if (!mv) return;
    remoteMove = true;
    applyMoveToBoard(m.from, m.to, mv, false);
    remoteMove = false;
    checkEndAndAI();
  });
  adapter.onClock((w: number, b: number) => {
    if (!clock) return;
    clock.whiteMs = w;
    clock.blackMs = b;
  });
  adapter.onOpponent((present: boolean) => {
    // could update UI; for now log
    if (present) console.log('Opponent joined');
  });
  adapter.onResign(() => { endGame('Opponent resigned. You win!'); });
  adapter.onDrawOffer(() => { showConfirm('Draw offered. Accept?', () => endGame('Draw agreed.')); });
}

let skinPreviewRenderer: THREE.WebGLRenderer | null = null;
let skinPreviewAnimId = 0;

function stopSkinPreview() {
  if (skinPreviewAnimId) { cancelAnimationFrame(skinPreviewAnimId); skinPreviewAnimId = 0; }
  if (skinPreviewRenderer) { skinPreviewRenderer.dispose(); skinPreviewRenderer = null; }
}

function showSkinSelect() {
  screen = 'skins';
  stopSkinPreview();
  const o = overlay(`
    <div class="main-menu">
      <div class="menu-layout" style="grid-template-columns: minmax(260px, 340px) 1fr; max-width:1100px; margin:0 auto;">
        <div class="left-col" style="justify-content:center;">
          <div class="royal-banner">
            <div class="title">SKINS &amp; BOARDS</div>
            <div class="subtitle">CHOOSE YOUR ARMY</div>
          </div>
          <div class="quick-panel" style="margin-top:12px;">
            <div class="mode-section">
              <div class="mode-name">PIECE SKIN</div>
              <div class="mode-desc">Select your army's appearance.</div>
              <div class="mode-options" style="flex-direction:column;gap:8px;">
                ${SKIN_NAMES.map((s) => `<button class="opt-btn ${s === pieceSkin ? 'selected' : ''}" data-skin="piece" data-val="${s}" style="text-align:left;">${s.toUpperCase()}</button>`).join('')}
              </div>
            </div>
            <div class="mode-section" style="margin-top:14px;">
              <div class="mode-name">BOARD SKIN</div>
              <div class="mode-desc">Select the battlefield.</div>
              <div class="mode-options" style="flex-direction:column;gap:8px;">
                ${SKIN_NAMES.map((s) => `<button class="opt-btn ${s === boardSkin ? 'selected' : ''}" data-skin="board" data-val="${s}" style="text-align:left;">${s.toUpperCase()}</button>`).join('')}
              </div>
            </div>
            <div style="margin-top:14px;">
              <button class="med-btn" data-act="back" style="justify-content:center;">BACK</button>
            </div>
          </div>
        </div>
        <div class="right-col" style="align-items:stretch;justify-content:center;">
          <div class="quick-panel" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div class="panel-title">PREVIEW</div>
            <canvas id="skinpreview" width="420" height="320" style="border:3px solid var(--c-gold,#C89B42);border-radius:6px;background:#1a1a2e;max-width:100%;"></canvas>
            <div id="skinlabel" style="margin-top:10px;font-family:'Jersey 10',monospace;font-size:1.1rem;color:#F2E9D5;letter-spacing:2px;">${pieceSkin.toUpperCase()} / ${boardSkin.toUpperCase()}</div>
          </div>
        </div>
      </div>
    </div>`);

  const previewCanvas = o.querySelector('#skinpreview') as HTMLCanvasElement;
  const label = o.querySelector('#skinlabel') as HTMLDivElement;

  async function refreshPreview() {
    stopSkinPreview();
    const renderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true });
    renderer.setSize(previewCanvas.width, previewCanvas.height, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKINS[boardSkin].backgroundColor);
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(5, 10, 5); scene.add(dir);
    const cam = new THREE.PerspectiveCamera(40, previewCanvas.width / previewCanvas.height, 0.1, 100);
    cam.position.set(9, 7, 9); cam.lookAt(0, 0.5, 0);
    const group = new THREE.Group();
    const bv = new BoardView(group, pieceSkin);
    bv.setSkin(pieceSkin);
    await bv.loadBoard(SKINS[boardSkin].boardPath);
    await bv.placeStart();
    scene.add(group);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.target.set(0, 0.5, 0);
    controls.update();
    function loop() {
      controls.update();
      renderer.render(scene, cam);
      skinPreviewAnimId = requestAnimationFrame(loop);
    }
    loop();
    skinPreviewRenderer = renderer;
    if (label) label.textContent = `${pieceSkin.toUpperCase()} / ${boardSkin.toUpperCase()}`;
  }

  o.querySelectorAll('[data-skin="piece"]').forEach((b) => {
    b.addEventListener('click', () => {
      SFX.click();
      pieceSkin = (b as HTMLElement).dataset.val as string;
      localStorage.setItem('ptk_pieceSkin', pieceSkin);
      o.querySelectorAll('[data-skin="piece"]').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      refreshPreview();
    });
  });
  o.querySelectorAll('[data-skin="board"]').forEach((b) => {
    b.addEventListener('click', () => {
      SFX.click();
      boardSkin = (b as HTMLElement).dataset.val as string;
      localStorage.setItem('ptk_boardSkin', boardSkin);
      o.querySelectorAll('[data-skin="board"]').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      refreshPreview();
    });
  });
  o.querySelector('[data-act="back"]')?.addEventListener('click', () => { SFX.click(); stopSkinPreview(); showMenu(); });
  refreshPreview();
}

function showSettings() {
  screen = 'settings';
  const o = overlay(`
    <div class="main-menu">
      <div class="menu-layout" style="grid-template-columns: minmax(260px, 320px) 1fr; max-width:1000px; margin:0 auto;">
        <div class="left-col" style="justify-content:center;">
          <div class="royal-banner">
            <div class="title">SETTINGS</div>
            <div class="subtitle">GAME OPTIONS</div>
          </div>
          <div style="margin-top:14px;">
            <button class="med-btn" data-act="back" style="justify-content:center;">BACK</button>
          </div>
        </div>
        <div class="right-col" style="align-items:stretch;justify-content:center;">
          <div class="quick-panel" style="flex:1;">
            <div class="panel-title">CONFIGURE</div>

            <div class="mode-section">
              <div class="mode-name">GRAPHICS</div>
              <div class="mode-desc">Rendering mode.</div>
              <div class="mode-options" style="flex-direction:column;gap:8px;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="radio" name="gfx" value="smooth" ${ctx.graphicsMode() === 'smooth' ? 'checked' : ''} /> Smooth (native, anti-aliased)
                </label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="radio" name="gfx" value="pixel" ${ctx.graphicsMode() === 'pixel' ? 'checked' : ''} /> Pixelated (retro)
                </label>
              </div>
              <div id="pixopts" style="margin-top:8px;display:${ctx.graphicsMode() === 'pixel' ? 'block' : 'none'};">
                <label style="display:block;margin:4px 0;">Pixel width: <input id="pw" type="number" value="${settings.width}" style="width:80px;" /></label>
                <label style="display:block;margin:4px 0;">Pixel height: <input id="ph" type="number" value="${settings.height}" style="width:80px;" /></label>
              </div>
            </div>

            <div class="mode-section" style="margin-top:14px;">
              <div class="mode-name">CINEMATICS</div>
              <div class="mode-desc">Capture animations.</div>
              <select id="cine" style="width:100%;">
                <option value="on" ${cinematicsMode === 'on' ? 'selected' : ''}>On (full)</option>
                <option value="short" ${cinematicsMode === 'short' ? 'selected' : ''}>Short</option>
                <option value="off" ${cinematicsMode === 'off' ? 'selected' : ''}>Off (skip)</option>
              </select>
            </div>

            <div class="mode-section" style="margin-top:14px;">
              <div class="mode-name">AUDIO</div>
              <div class="mode-desc">Sound effects.</div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" id="vol" ${volumeOn ? 'checked' : ''} /> Sound enabled
              </label>
            </div>

            <div style="margin-top:16px;display:flex;gap:8px;">
              <button class="med-btn" data-act="apply" style="flex:1;justify-content:center;">APPLY</button>
              <button class="med-btn" data-act="reset" style="flex:1;justify-content:center;">RESET DEFAULTS</button>
            </div>
          </div>
        </div>
      </div>
    </div>`);

  const gfxRadios = o.querySelectorAll('input[name="gfx"]') as NodeListOf<HTMLInputElement>;
  const pixopts = o.querySelector('#pixopts') as HTMLDivElement;
  gfxRadios.forEach((r) => r.addEventListener('change', () => {
    if (pixopts) pixopts.style.display = (o.querySelector('input[name="gfx"]:checked') as HTMLInputElement)?.value === 'pixel' ? 'block' : 'none';
  }));

  o.querySelector('[data-act="apply"]')?.addEventListener('click', () => {
    SFX.click();
    settings.width = parseInt((o.querySelector('#pw') as HTMLInputElement)?.value || '640') || 640;
    settings.height = parseInt((o.querySelector('#ph') as HTMLInputElement)?.value || '360') || 360;
    saveSettings(settings);
    const gfx = (o.querySelector('input[name="gfx"]:checked') as HTMLInputElement)?.value as 'pixel' | 'smooth';
    ctx.applyGraphicsMode(gfx);
    cinematicsMode = (o.querySelector('#cine') as HTMLSelectElement).value as any;
    localStorage.setItem('ptk_cine', cinematicsMode);
    volumeOn = (o.querySelector('#vol') as HTMLInputElement).checked;
    localStorage.setItem('ptk_vol', volumeOn ? '1' : '0');
    showToast('Settings applied.');
  });
  o.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
    SFX.click();
    settings = { width: 640, height: 360, posterize: false, outline: false };
    saveSettings(settings);
    ctx.applyGraphicsMode('smooth');
    cinematicsMode = 'on';
    localStorage.setItem('ptk_cine', cinematicsMode);
    volumeOn = true;
    localStorage.setItem('ptk_vol', '1');
    showSettings();
    showToast('Reset to defaults.');
  });
  o.querySelector('[data-act="back"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
}

function showBattleIntro() {
  introActive = true;
  const el = document.createElement('div');
  el.className = 'battle-intro';
  el.innerHTML = `<div class="bi-title">THE BATTLE BEGINS</div><div class="bi-sub">PROTECT YOUR KING</div>`;
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); introActive = false; }, 2400);
}

function isMultiplayer(): boolean { return gameMode === 'online' || gameMode === 'local'; }

function showGameMenuButton() {
  document.querySelectorAll('.game-menu-btn, .game-cam-btn').forEach((e) => e.remove());
  const btn = document.createElement('button');
  btn.className = 'game-menu-btn';
  btn.textContent = 'MENU';
  btn.addEventListener('click', () => {
    SFX.click();
    if (isMultiplayer()) {
      const o = overlay(`
        <div class="menu-card">
          <div class="title">OPTIONS</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
            <button data-act="draw">OFFER DRAW</button>
            <button data-act="resign">RESIGN</button>
            <button data-act="leave">LEAVE GAME</button>
            <button data-act="cancel">CANCEL</button>
          </div>
        </div>`);
      o.querySelector('[data-act="draw"]')?.addEventListener('click', () => { SFX.click(); adapter?.offerDraw(); clearOverlays(); });
      o.querySelector('[data-act="resign"]')?.addEventListener('click', () => { SFX.click(); adapter?.resign(); endGame('You resigned.'); });
      o.querySelector('[data-act="leave"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
      o.querySelector('[data-act="cancel"]')?.addEventListener('click', () => { SFX.click(); clearOverlays(); });
    } else {
      togglePause();
    }
  });
  document.body.appendChild(btn);

  const camBtn = document.createElement('button');
  camBtn.className = 'game-menu-btn game-cam-btn';
  camBtn.style.left = '90px';
  camBtn.textContent = 'RESET VIEW';
  camBtn.addEventListener('click', () => { SFX.click(); ctx.resetView(playerColor === 'b'); });
  document.body.appendChild(camBtn);
}

function togglePause() {
  if (gameOver) return;
  if (paused) { resumeGame(); } else { pauseGame(); }
}

function pauseGame() {
  paused = true;
  if (clock) clock.stop();
  const o = overlay(`
    <div class="menu-card">
      <div class="title">PAUSED</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button data-act="resume">RESUME</button>
        <button data-act="menu">RETURN TO MENU</button>
      </div>
    </div>`);
  o.querySelector('[data-act="resume"]')?.addEventListener('click', () => { SFX.click(); resumeGame(); clearOverlays(); });
  o.querySelector('[data-act="menu"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
}

function resumeGame() {
  paused = false;
  if (clock && clock.active) clock.start(clock.active);
  clearOverlays();
}

// ---- Game start ----
async function startGame() {
  screen = 'game';
  clearOverlays();
  game = new ChessGame();
  boardView = new BoardView(ctx.group, pieceSkin);
  // clear group
  while (ctx.group.children.length) ctx.group.remove(ctx.group.children[0]);
  ctx.group.add(boardView.markerGroup);
  moveHistory = []; capturedPieces = []; gameOver = false; selected = null;

  loading.classList.remove('hidden');
  loadingText.textContent = 'Loading board...';
  barFillEl.style.width = '0%';
  await boardView.loadBoard(SKINS[boardSkin].boardPath);
  barFillEl.style.width = '40%';
  loadingText.textContent = 'Loading pieces...';
  await boardView.placeStart();
  barFillEl.style.width = '100%';
  loadingText.textContent = 'Ready';
  setTimeout(() => loading.classList.add('hidden'), 200);

  ctx.scene.background = new THREE.Color(SKINS[boardSkin].backgroundColor);

  if (gameMode === 'ai') { if (ai) ai.terminate(); ai = new AI(); }
  if (gameMode === 'timed' || gameMode === 'online') {
    clock = new Clock(timedPreset.min, timedPreset.inc);
    clock.onFlag = (color) => endGame(color === 'w' ? 'Black wins on time' : 'White wins on time');
  } else {
    clock = null;
  }

  // HUD container
  ensureHUD();
  updateHUD();
  hudUpdateTurn();
  if (playerColor === 'b') ctx.resetView(true);
  else ctx.resetView(false);

  // Battle intro animation
  showBattleIntro();
  // In-game menu button
  showGameMenuButton();
}

function ensureHUD() {
  let h = document.getElementById('gamehud');
  if (h) return;
  h = document.createElement('div');
  h.id = 'gamehud';
  h.style.cssText = 'position:fixed;top:12px;right:12px;width:250px;max-height:88vh;overflow:hidden;background:linear-gradient(180deg,rgba(57,49,44,0.95),rgba(28,27,25,0.95));border:3px solid #C89B42;border-radius:6px;padding:12px;color:#F2E9D5;font-family:"Jersey 10",monospace;font-size:14px;z-index:5;box-shadow:0 8px 24px rgba(0,0,0,0.6),inset 0 0 0 2px rgba(0,0,0,0.3);backdrop-filter:blur(4px);';
  h.innerHTML = `
    <div style="text-align:center;font-size:1.1rem;letter-spacing:2px;color:#C89B42;margin-bottom:10px;font-family:'Cinzel Decorative',serif;text-shadow:0 2px 0 rgba(0,0,0,0.6);border-bottom:1px solid rgba(200,155,66,0.4);padding-bottom:8px;">PROTECT THE KING</div>
    <div style="display:flex;gap:6px;margin-bottom:10px;">
      <div id="clkW" style="flex:1;text-align:center;padding:6px;border-radius:4px;background:rgba(28,27,25,0.7);border:2px solid #C89B42;">W 10:00</div>
      <div id="clkB" style="flex:1;text-align:center;padding:6px;border-radius:4px;background:rgba(28,27,25,0.7);border:2px solid #C89B42;">B 10:00</div>
    </div>
    <div id="turn" style="text-align:center;padding:4px 6px;margin-bottom:8px;border-radius:4px;font-size:0.95rem;letter-spacing:2px;color:#F2E9D5;background:rgba(28,27,25,0.5);border:1px solid rgba(200,155,66,0.3);">WHITE'S TURN</div>
    <div style="font-size:0.9rem;letter-spacing:2px;color:#C89B42;margin-bottom:4px;font-family:'Cinzel Decorative',serif;">MOVES</div>
    <div id="movelist" style="max-height:46vh;overflow:auto;line-height:1.9;padding-right:4px;"></div>
    <div style="font-size:0.9rem;letter-spacing:2px;color:#C89B42;margin:8px 0 4px;font-family:'Cinzel Decorative',serif;">CAPTURED</div>
    <div id="captured" style="min-height:24px;font-size:16px;letter-spacing:2px;color:#ff8899;"></div>`;
  document.body.appendChild(h);
  if (hudInterval) clearInterval(hudInterval);
  hudInterval = setInterval(() => {
    if (clock && !gameOver && !paused) {
      const w = document.getElementById('clkW'); const b = document.getElementById('clkB');
      if (w) w.textContent = 'W: ' + clock.format(clock.whiteMs);
      if (b) b.textContent = 'B: ' + clock.format(clock.blackMs);
    }
  }, 200);
}

const PIECE_SYMBOL: Record<string, string> = { pawn: '♟', knight: '♞', bishop: '♝', rook: '♜', queen: '♛', king: '♚' };
function updateHUD() {
  const ml = document.getElementById('movelist');
  if (ml) {
    let html = '';
    for (let i = 0; i < moveHistory.length; i += 2) {
      const n = Math.floor(i / 2) + 1;
      const w = moveHistory[i] || '';
      const b = moveHistory[i + 1] || '';
      const bg = i % 4 === 0 ? 'rgba(200,155,66,0.08)' : 'transparent';
      html += `<div style="display:flex;padding:3px 6px;border-radius:4px;background:${bg};border-bottom:1px solid rgba(200,155,66,0.15);"><span style="width:24px;opacity:0.6;color:#C89B42;">${n}.</span><span style="flex:1;color:#F2E9D5;">${w}</span><span style="flex:1;color:#ff8899;">${b}</span></div>`;
    }
    ml.innerHTML = html;
    ml.scrollTop = ml.scrollHeight;
  }
  const cap = document.getElementById('captured');
  if (cap) cap.textContent = capturedPieces.map((p) => PIECE_SYMBOL[p] || p).join(' ');
}

// ---- Move application ----
function applyMoveToBoard(from: string, to: string, mv: any, _isCapture: boolean) {
  const piece = boardView!.getPieceAt(from);
  const victim = boardView!.getPieceAt(to);
  const isCaptureMove = !!victim || mv.flags?.includes('c') || mv.flags?.includes('e');
  const pieceType = piece?.type || 'pawn';
  const promo = mv.promotion;
  const wasRemote = remoteMove;

  const doApply = () => {
    if (isCaptureMove) {
      if (victim) capturedPieces.push(victim.type);
      else if (mv.flags?.includes('e')) capturedPieces.push('pawn');
    }
    if (promo) {
      boardView!.removePiece(from);
      boardView!.removePiece(to);
      boardView!.addPiece(to, (mv.color === 'w' ? 'white' : 'black') as any, promo === 'q' ? 'queen' : promo === 'r' ? 'rook' : promo === 'b' ? 'bishop' : 'knight').then((pm) => {
        pm.mesh.scale.set(0.01, 0.01, 0.01);
        const t0 = performance.now();
        const step = () => {
          const t = Math.min(1, (performance.now() - t0) / 250);
          const s = 1 + 0.2 * Math.sin(t * Math.PI);
          pm.mesh.scale.set(s, s, s);
          if (t < 1) requestAnimationFrame(step); else pm.mesh.scale.set(1, 1, 1);
        };
        requestAnimationFrame(step);
      });
    } else {
      boardView!.movePiece(from, to);
    }
    moveHistory.push(mv.san);
    boardView!.showLastMove(from, to);
    if (game!.isCheck()) {
      const side = game!.turn() === 'w' ? 'white' : 'black';
      for (const [sq, pm] of boardView!.pieces) { if (pm.type === 'king' && pm.color === side) { boardView!.showCheck(sq); break; } }
    }
    if (gameMode === 'online' && adapter && !wasRemote) adapter.sendMove({ from, to, promotion: mv.promotion, fen: game!.fen() });
    if (clock && (gameMode === 'timed' || gameMode === 'online') && !remoteMove) adapter?.sendClock(clock.whiteMs, clock.blackMs);
    updateHUD();
    SFX.move();
    if (mv.san.includes('+') || mv.san.includes('#')) { SFX.check(); }
  };

  const cinematicsOn = cinematicsMode !== 'off' && isCaptureMove;
  const shortMode = cinematicsMode === 'short' || gameMode === 'timed';
  if (cinematicsOn && piece) {
    const victimMesh = victim?.mesh || null;
    // lock input via gameOver-ish flag
    // lock input during cinematic (gameOver stays false)
    // run async
    playCapture(
      { scene: ctx.scene, camera: ctx.camera, controls: ctx.controls, group: ctx.group },
      piece.mesh,
      victimMesh,
      from, to, pieceType,
      SKINS[pieceSkin].effectColor,
      shortMode,
    ).then(() => {
      doApply();
      checkEndAndAI();
    });
  } else {
    doApply();
    checkEndAndAI();
  }
}

function checkEndAndAI() {
  if (!game) return;
  if (game.isGameOver()) { handleGameOver(); return; }
  if (clock && (gameMode === 'timed' || gameMode === 'online')) {
    if (!clock.started && moveHistory.length >= 1) clock.start(game.turn() === 'w' ? 'w' : 'b');
    else clock.switchTo(game.turn() === 'w' ? 'w' : 'b');
  }
  // AI move
  if (gameMode === 'ai' && game.turn() !== playerColor[0] as 'w' | 'b' && !gameOver && !paused) {
    const turnEl = document.getElementById('turn');
    if (turnEl) turnEl.textContent = 'AI THINKING...';
    setTimeout(() => { if (!paused) doAIMove(); }, 300);
  }
  // (online send handled in applyMoveToBoard)
  hudUpdateTurn();
}

function hudUpdateTurn() {
  const turnEl = document.getElementById('turn');
  if (!game) return;
  const side = game.turn() === 'w' ? 'White' : 'Black';
  const isCheck = game.isCheck();
  if (turnEl) {
    turnEl.textContent = isCheck ? `${side.toUpperCase()} IN CHECK!` : `${side.toUpperCase()}'S TURN`;
    turnEl.style.color = isCheck ? '#ff5566' : '#F2E9D5';
    turnEl.style.borderColor = isCheck ? '#ff3355' : 'rgba(200,155,66,0.3)';
    turnEl.style.background = isCheck ? 'rgba(181,46,50,0.25)' : 'rgba(28,27,25,0.5)';
  }
  // highlight active clock
  const w = document.getElementById('clkW'); const b = document.getElementById('clkB');
  if (w) w.style.borderColor = game.turn() === 'w' ? '#ffd700' : 'rgba(200,155,66,0.4)';
  if (b) b.style.borderColor = game.turn() === 'b' ? '#ffd700' : 'rgba(200,155,66,0.4)';
  if (w) w.style.opacity = game.turn() === 'w' ? '1' : '0.6';
  if (b) b.style.opacity = game.turn() === 'b' ? '1' : '0.6';
}

async function doAIMove() {
  if (!game || !ai || gameOver) return;
  await ai.init();
  const fen = game.fen();
  const legal = game.moves().map((m: any) => m.from + m.to + (m.promotion || ''));
  const res = await ai.bestMove(fen, difficulty, legal);
  if (!res) { showToast('AI failed to move. Check console.'); return; }
  const mv = game.move(res.from, res.to, res.promotion);
  if (!mv) return;
  applyMoveToBoard(res.from, res.to, mv, true);
}

function handleGameOver() {
  gameOver = true;
  if (clock) clock.stop();
  let msg = 'Game over';
  if (game!.isCheckmate()) msg = `Checkmate! ${game!.turn() === 'w' ? 'Black' : 'White'} wins`;
  else if (game!.isStalemate()) msg = 'Stalemate';
  else if (game!.isDraw()) msg = 'Draw';
  SFX.mate();
  // gameover screen
  const o = overlay(`
    <div class="menu-card">
      <div class="title">${msg.toUpperCase()}</div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
        <button data-act="rematch">REMATCH</button>
        <button data-act="menu">MENU</button>
      </div>
    </div>`);
  o.querySelector('[data-act="rematch"]')?.addEventListener('click', () => { SFX.click(); startGame(); });
  o.querySelector('[data-act="menu"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
}

function endGame(msg: string) {
  if (gameOver) return;
  gameOver = true;
  if (clock) clock.stop();
  if (hudInterval) { clearInterval(hudInterval); hudInterval = null; }
  document.querySelectorAll('.game-menu-btn, .game-cam-btn').forEach((e) => e.remove());
  SFX.mate();
  const o = overlay(`
    <div class="menu-card">
      <div class="title">${msg.toUpperCase()}</div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
        <button data-act="menu">MENU</button>
      </div>
    </div>`);
  o.querySelector('[data-act="menu"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
}

// ---- Input ----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
canvas.addEventListener('click', (e) => {
  if (screen !== 'game' || gameOver || paused || introActive) return;
  // ignore if cinematics running? simple: allow
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, ctx.camera);
  const hits = raycaster.intersectObjects(ctx.group.children, true);
  let sq: string | null = null;
  for (const h of hits) {
    const p = h.point;
    const i = Math.round((p.x + 4.95) / 1.4);
    const j = Math.round((p.z + 4.95) / 1.4);
    if (i >= 0 && i <= 7 && j >= 0 && j <= 7) { const files = 'abcdefgh'; sq = `${files[i]}${j + 1}`; break; }
  }
  if (!sq || !game || !boardView) return;

  if (selected) {
    const legal = game.moves(selected).map((m: any) => m.to);
    if (legal.includes(sq)) {
      const piece = boardView.getPieceAt(selected);
      const isPromo = piece?.type === 'pawn' && (sq[1] === '8' || sq[1] === '1');
      const doMove = (promo?: string) => {
        const mv = game!.move(selected!, sq!, promo);
        if (!mv) return;
        const victim = boardView!.getPieceAt(sq!);
        const isCap = !!victim || (mv.flags || '').includes('c') || (mv.flags || '').includes('e');
        applyMoveToBoard(selected!, sq!, mv, isCap);
        selected = null;
        boardView!.clearMarkers();
      };
      if (isPromo) showPromotionPicker(game.turn() === 'w' ? 'w' : 'b', (p) => doMove(p));
      else doMove();
    } else {
      const pm = boardView.getPieceAt(sq);
      if (pm && ((pm.color === 'white') === (game.turn() === 'w'))) {
        selected = sq;
        const moves = game.moves(sq);
        const sqs = moves.map((m: any) => m.to);
        const caps = new Set(moves.filter((m: any) => m.flags && (m.flags.includes('c') || m.flags.includes('e'))).map((m: any) => m.to));
        boardView.showLegalMoves(sqs, caps);
      } else {
        selected = null;
        boardView.clearMarkers();
      }
    }
  } else {
    const pm = boardView.getPieceAt(sq);
    if (pm && ((pm.color === 'white') === (game.turn() === 'w'))) {
      selected = sq;
      const moves = game.moves(sq);
      const sqs = moves.map((m: any) => m.to);
      const caps = new Set(moves.filter((m: any) => m.flags && (m.flags.includes('c') || m.flags.includes('e'))).map((m: any) => m.to));
      boardView.showLegalMoves(sqs, caps);
    }
  }
});

// ---- Init ----
loadingText.textContent = 'Ready';
barFillEl.style.width = '100%';
setTimeout(() => loading.classList.add('hidden'), 200);

showMenu();
renderLoop(ctx, () => { if (boardView) boardView.animateMarkers(); });