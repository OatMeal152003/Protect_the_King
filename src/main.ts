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
let remoteMove = false;
// captured tracking (placeholder)
let moveHistory: string[] = [];

// ---- DOM helpers ----
function clearOverlays() { document.querySelectorAll('.overlay').forEach((o) => o.remove()); }
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
  const o = overlay(`
    <div class="loading-box">
      <div class="title">PROTECT THE KING</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px;">
        <button data-act="mode">Play</button>
        <button data-act="skins">Skins</button>
        <button data-act="settings">Settings</button>
      </div>
    </div>`);
  o.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    SFX.click();
    const act = (b as HTMLElement).dataset.act;
    if (act === 'mode') showModeSelect();
    if (act === 'skins') showSkinSelect();
    if (act === 'settings') showSettings();
  }));
}

function showModeSelect() {
  screen = 'mode';
  const o = overlay(`
    <div class="loading-box">
      <div class="title">SELECT MODE</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button data-mode="ai">vs Computer</button>
        <button data-mode="classic">Classic (untimed)</button>
        <button data-mode="timed">Timed</button>
        <button data-mode="local">Local pass-and-play</button>
        <button data-mode="online">Online (room code)</button>
        <button data-act="back">Back</button>
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
    <div class="loading-box">
      <div class="title">DIFFICULTY</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button data-d="easy">Easy</button>
        <button data-d="medium">Medium</button>
        <button data-d="hard">Hard</button>
        <button data-act="back">Back</button>
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
    <div class="loading-box">
      <div class="title">TIMED</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button data-t="3+2">Blitz 3+2</button>
        <button data-t="10+0">Rapid 10+0</button>
        <button data-t="custom">Custom</button>
        <button data-act="back">Back</button>
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
    <div class="loading-box">
      <div class="title">ONLINE</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button data-act="create">Create room</button>
        <input id="joincode" placeholder="6-char code" style="padding:8px;font-family:monospace;text-transform:uppercase;" />
        <button data-act="join">Join room</button>
        <button data-act="back">Back</button>
      </div>
    </div>`);
  o.querySelector('[data-act="create"]')?.addEventListener('click', async () => {
    SFX.click();
    adapter = createAdapter();
    const code = await adapter.createRoom();
    alert('Room code: ' + code + ' (share it). Waiting for opponent...');
    gameMode = 'online';
    playerColor = 'w';
    setupOnlineHandlers();
    startGame();
  });
  o.querySelector('[data-act="join"]')?.addEventListener('click', async () => {
    SFX.click();
    const code = (o.querySelector('#joincode') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length < 4) { alert('Enter a code'); return; }
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
  });
  adapter.onResign(() => { endGame('Opponent resigned. You win!'); });
  adapter.onDrawOffer(() => { if (confirm('Draw offered. Accept?')) endGame('Draw agreed.'); });
}

function showSkinSelect() {
  screen = 'skins';
  const o = overlay(`
    <div class="loading-box">
      <div class="title">SKINS</div>
      <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;justify-content:center;">
        <div>
          <label>Pieces</label><br/>
          <select id="pskin">${SKIN_NAMES.map((s) => `<option value="${s}" ${s === pieceSkin ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div>
          <label>Board</label><br/>
          <select id="bskin">${SKIN_NAMES.map((s) => `<option value="${s}" ${s === boardSkin ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
      </div>
      <canvas id="preview" width="240" height="180" style="margin-top:12px;border:1px solid #fff;image-rendering:pixelated;"></canvas>
      <div style="margin-top:12px;"><button data-act="back">Back</button></div>
    </div>`);
  const ps = o.querySelector('#pskin') as HTMLSelectElement;
  const bs = o.querySelector('#bskin') as HTMLSelectElement;
  ps.onchange = () => { pieceSkin = ps.value; localStorage.setItem('ptk_pieceSkin', pieceSkin); };
  bs.onchange = () => { boardSkin = bs.value; localStorage.setItem('ptk_boardSkin', boardSkin); };
  o.querySelector('[data-act="back"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
  // live preview (simple: just show skin name; full 3D preview omitted for brevity)
}

function showSettings() {
  screen = 'settings';
  const o = overlay(`
    <div class="loading-box">
      <div class="title">SETTINGS</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;align-items:center;">
        <label>Pixel width: <input id="pw" type="number" value="${settings.width}" style="width:70px;" /></label>
        <label>Pixel height: <input id="ph" type="number" value="${settings.height}" style="width:70px;" /></label>
        <label>Cinematics:
          <select id="cine">
            <option value="on" ${cinematicsMode === 'on' ? 'selected' : ''}>On</option>
            <option value="short" ${cinematicsMode === 'short' ? 'selected' : ''}>Short</option>
            <option value="off" ${cinematicsMode === 'off' ? 'selected' : ''}>Off</option>
          </select>
        </label>
        <label><input type="checkbox" id="vol" ${volumeOn ? 'checked' : ''} /> Sound</label>
        <button data-act="back">Back</button>
      </div>
    </div>`);
  o.querySelector('[data-act="back"]')?.addEventListener('click', () => {
    settings.width = parseInt((o.querySelector('#pw') as HTMLInputElement).value) || 320;
    settings.height = parseInt((o.querySelector('#ph') as HTMLInputElement).value) || 180;
    ctx.applyPixelSize(settings.width, settings.height);
    saveSettings(settings);
    cinematicsMode = (o.querySelector('#cine') as HTMLSelectElement).value as any;
    localStorage.setItem('ptk_cine', cinematicsMode);
    volumeOn = (o.querySelector('#vol') as HTMLInputElement).checked;
    localStorage.setItem('ptk_vol', volumeOn ? '1' : '0');
    SFX.click();
    showMenu();
  });
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
  moveHistory = []; gameOver = false; selected = null;

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

  if (gameMode === 'ai') ai = new AI();
  if (gameMode === 'timed' || gameMode === 'online') {
    clock = new Clock(timedPreset.min, timedPreset.inc);
    clock.onFlag = (color) => endGame(color === 'w' ? 'Black wins on time' : 'White wins on time');
  } else {
    clock = null;
  }

  // HUD container
  ensureHUD();
  updateHUD();
  if (playerColor === 'b') ctx.resetView(true);
  else ctx.resetView(false);
}

function ensureHUD() {
  let h = document.getElementById('gamehud');
  if (h) return;
  h = document.createElement('div');
  h.id = 'gamehud';
  h.style.cssText = 'position:fixed;bottom:8px;left:8px;right:8px;display:flex;justify-content:space-between;color:#fff;font-family:monospace;font-size:11px;z-index:5;pointer-events:none;';
  h.innerHTML = `<div id="clkW">W: --</div><div id="movelist" style="max-width:40%;overflow:auto;max-height:80px;pointer-events:auto;"></div><div id="clkB">B: --</div>`;
  document.body.appendChild(h);
  // clock update loop
  setInterval(() => {
    if (clock && !gameOver) {
      const w = document.getElementById('clkW'); const b = document.getElementById('clkB');
      if (w) w.textContent = 'W: ' + clock.format(clock.whiteMs);
      if (b) b.textContent = 'B: ' + clock.format(clock.blackMs);
    }
  }, 200);
}

function updateHUD() {
  const ml = document.getElementById('movelist');
  if (ml) ml.textContent = moveHistory.join(' ');
}

// ---- Move application ----
function applyMoveToBoard(from: string, to: string, mv: any, _isCapture: boolean) {
  const piece = boardView!.getPieceAt(from);
  const victim = boardView!.getPieceAt(to);
  const isCaptureMove = !!victim || mv.flags?.includes('c') || mv.flags?.includes('e');
  const pieceType = piece?.type || 'pawn';
  const promo = mv.promotion;

  const doApply = () => {
    if (isCaptureMove && victim) {
      // track captured (placeholder)
    }
    if (promo) {
      // replace pawn mesh with promoted piece
      boardView!.removePiece(from);
      boardView!.removePiece(to);
      boardView!.addPiece(to, (mv.color === 'w' ? 'white' : 'black') as any, promo === 'q' ? 'queen' : promo === 'r' ? 'rook' : promo === 'b' ? 'bishop' : 'knight');
    } else {
      boardView!.movePiece(from, to);
    }
    moveHistory.push(mv.san);
    if (gameMode === 'online' && adapter && !remoteMove) adapter.sendMove({ from, to, promotion: mv.promotion, fen: game!.fen() });
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
  if (gameMode === 'ai' && game.turn() !== playerColor[0] as 'w' | 'b' && !gameOver) {
    setTimeout(() => doAIMove(), 300);
  }
  // (online send handled in applyMoveToBoard)
  hudUpdateTurn();
}

function hudUpdateTurn() {
  // no-op extra
}

async function doAIMove() {
  if (!game || !ai || gameOver) return;
  await ai.init();
  const fen = game.fen();
  const legal = game.moves().map((m: any) => m.from + m.to + (m.promotion || ''));
  const res = await ai.bestMove(fen, difficulty, legal);
  if (!res) return;
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
    <div class="loading-box">
      <div class="title">${msg.toUpperCase()}</div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
        <button data-act="rematch">Rematch</button>
        <button data-act="menu">Menu</button>
      </div>
    </div>`);
  o.querySelector('[data-act="rematch"]')?.addEventListener('click', () => { SFX.click(); startGame(); });
  o.querySelector('[data-act="menu"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
}

function endGame(msg: string) {
  if (gameOver) return;
  gameOver = true;
  if (clock) clock.stop();
  SFX.mate();
  const o = overlay(`
    <div class="loading-box">
      <div class="title">${msg.toUpperCase()}</div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
        <button data-act="menu">Menu</button>
      </div>
    </div>`);
  o.querySelector('[data-act="menu"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
}

// ---- Input ----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
canvas.addEventListener('click', (e) => {
  if (screen !== 'game' || gameOver) return;
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
        const mv = game.moves(sq).map((m: any) => m.to);
        boardView.showLegalMoves(mv);
      } else {
        selected = null;
        boardView.clearMarkers();
      }
    }
  } else {
    const pm = boardView.getPieceAt(sq);
    if (pm && ((pm.color === 'white') === (game.turn() === 'w'))) {
      selected = sq;
      const mv = game.moves(sq).map((m: any) => m.to);
      boardView.showLegalMoves(mv);
    }
  }
});

// ---- Init ----
loadingText.textContent = 'Ready';
barFillEl.style.width = '100%';
setTimeout(() => loading.classList.add('hidden'), 200);

showMenu();
renderLoop(ctx, () => {});