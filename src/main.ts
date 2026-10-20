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
import type { NetAdapter, NetMove, RoomSettings } from './net';
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
type Screen = 'menu' | 'game';
let screen: Screen = 'menu';
let pieceSkin = localStorage.getItem('ptk_pieceSkin') || 'classic';
let boardSkin = localStorage.getItem('ptk_boardSkin') || 'classic';
let cinematicsMode: 'on' | 'short' | 'off' = (localStorage.getItem('ptk_cine') as any) || 'on';
let volumeOn = localStorage.getItem('ptk_vol') !== '0';
SFX.setMuted(!volumeOn);

let game: ChessGame | null = null;
let boardView: BoardView | null = null;
let clock: Clock | null = null;
let ai: AI | null = null;
let adapter: NetAdapter | null = null;
let gameMode: 'ai' | 'classic' | 'timed' | 'online' = 'classic';
let difficulty: Difficulty = 'medium';
let timedPreset: { min: number; inc: number } = { min: 10, inc: 0 };
let clockEnabled = false;
let playerColor: 'w' | 'b' = 'w';
let selected: string | null = null;
let gameOver = false;
let paused = false;
let introActive = false;
let cinematicActive = false;
/** Completes an in-flight capture cinematic immediately (see applyMoveToBoard). */
let flushPendingCapture: (() => void) | null = null;
/** Incremented per game so late callbacks from an old game can never mutate a new one. */
let gameSession = 0;
let remoteMove = false;
let hudInterval: ReturnType<typeof setInterval> | null = null;
type CapturedPiece = { type: string; color: 'white' | 'black' };
let moveHistory: string[] = [];
/** Pieces captured by each side, for the per-player HUD trays. */
let capturedBy: Record<'w' | 'b', CapturedPiece[]> = { w: [], b: [] };
let pendingMoves: NetMove[] = [];

// ---- DOM helpers ----
function clearOverlays() {
  disposeSkinPreview();
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
}
let toastEl: HTMLDivElement | null = null;
let toastTimer: number | undefined;
function showToast(msg: string, ms = 3000): void {
  if (!toastEl || !document.body.contains(toastEl)) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('show'), ms);
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
function overlay(html: string): HTMLDivElement {
  clearOverlays();
  const d = document.createElement('div');
  d.className = 'overlay';
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}

// ---- Main Menu ----
type MenuTab = 'play' | 'online' | 'local' | 'skins' | 'settings';
type TimeKey = 'none' | 'bullet' | 'blitz' | 'rapid' | 'classical';
type SideChoice = 'white' | 'random' | 'black';
type MenuLevel = 'easy' | 'medium' | 'hard' | 'expert';

const TIME_PRESETS: Record<Exclude<TimeKey, 'none'>, { label: string; note: string; min: number; inc: number }> = {
  bullet: { label: 'Bullet', note: '1 min', min: 1, inc: 0 },
  blitz: { label: 'Blitz', note: '3 + 2', min: 3, inc: 2 },
  rapid: { label: 'Rapid', note: '10 min', min: 10, inc: 0 },
  classical: { label: 'Classical', note: '30 min', min: 30, inc: 0 },
};
const TIME_ORDER: TimeKey[] = ['none', 'bullet', 'blitz', 'rapid', 'classical'];
const MENU_LEVELS: Record<MenuLevel, { label: string; hint: string }> = {
  easy: { label: 'Easy', hint: 'Makes mistakes. Good for learning.' },
  medium: { label: 'Medium', hint: 'Plays sensible moves.' },
  hard: { label: 'Hard', hint: 'Punishes loose pieces.' },
  expert: { label: 'Expert', hint: 'No mercy for the careless.' },
};
const LEVEL_ORDER: MenuLevel[] = ['easy', 'medium', 'hard', 'expert'];
const SIDE_ORDER: SideChoice[] = ['white', 'random', 'black'];

let menuTab: MenuTab = 'play';
let menuLevel: MenuLevel = 'medium';
let menuTime: TimeKey = 'rapid';
let menuSide: SideChoice = 'white';
let localTime: TimeKey = 'none';
let localSide: SideChoice = 'white';
let onlineTime: TimeKey = 'rapid';
let onlineSide: SideChoice = 'white';
/** Clock setup resolved from the online room (host-chosen for both players). */
let onlineInitialMs = 600000;
let onlineIncMs = 0;
let menuRoomCode = '';
let menuRooms: { code: string; created_at: string }[] = [];
let menuRoomsStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
let menuRoomsError = '';
let menuRoot: HTMLElement | null = null;
/** Prevents a double click from opening two rooms / joining twice. */
let roomSetupBusy = false;

const MENU_ITEMS: { id: MenuTab | 'puzzles'; label: string; icon: string; disabled?: boolean }[] = [
  { id: 'play', label: 'Play chess', icon: 'crown' },
  { id: 'online', label: 'Online multiplayer', icon: 'swords' },
  { id: 'local', label: 'Local multiplayer', icon: 'pawn' },
  { id: 'puzzles', label: 'Puzzles & challenges', icon: 'puzzle', disabled: true },
  { id: 'skins', label: 'Skins & boards', icon: 'shield' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];
const MENU_ICONS: Record<string, string> = {
  crown: '<path d="M3 18h18l-1.5-9-4.5 4-3-7-3 7-4.5-4z" fill="currentColor"/>',
  swords: '<path d="M4 4l9 9m-2 2l-4 4M20 4l-9 9m2 2l4 4M3 21l3-3m15 3l-3-3" stroke="currentColor" stroke-width="2.2" fill="none"/>',
  pawn: '<circle cx="12" cy="7" r="3.5" fill="currentColor"/><path d="M8 20c0-5 2-6 4-6s4 1 4 6z" fill="currentColor"/>',
  puzzle: '<path d="M5 5h5a2 2 0 114 0h5v5a2 2 0 100 4v5h-5a2 2 0 10-4 0H5v-5a2 2 0 100-4z" fill="currentColor"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" stroke="currentColor" stroke-width="2.4"/>',
};

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function timePresetOf(t: TimeKey): { min: number; inc: number } {
  return t === 'none' ? { min: 10, inc: 0 } : { min: TIME_PRESETS[t].min, inc: TIME_PRESETS[t].inc };
}
function timeLabel(t: TimeKey): string {
  return t === 'none' ? 'Untimed' : `${TIME_PRESETS[t].label} ${TIME_PRESETS[t].note}`;
}
/** Label room settings that arrived over the wire (initial/increment in ms). */
function roomTimeLabel(initialMs: number, incMs: number): string {
  if (!initialMs) return 'Untimed';
  const min = initialMs / 60000;
  const inc = incMs / 1000;
  const key = (Object.keys(TIME_PRESETS) as Exclude<TimeKey, 'none'>[])
    .find((k) => TIME_PRESETS[k].min === min && TIME_PRESETS[k].inc === inc);
  return key ? `${TIME_PRESETS[key].label} ${TIME_PRESETS[key].note}` : `${min} min${inc ? ` + ${inc}` : ''}`;
}
function hasSupabase(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
function navHtml(): string {
  return MENU_ITEMS.map((item) => {
    const disabled = !!item.disabled;
    return `<button type="button" role="tab" id="tab-${item.id}" data-tab="${item.id}" aria-controls="menu-panel" aria-selected="${menuTab === item.id}" tabindex="${menuTab === item.id ? '0' : '-1'}"${disabled ? ' disabled aria-disabled="true"' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true">${MENU_ICONS[item.icon]}</svg>
      <span class="tab-label">${item.label}</span>${disabled ? '<span class="soon">Soon</span>' : ''}
    </button>`;
  }).join('');
}
function chipButton(set: string, val: string, label: string, pressed: boolean, sub?: string): string {
  return `<button class="chip" type="button" data-set="${set}" data-val="${val}" aria-pressed="${pressed}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
}
function timeChips(set: 'time' | 'localTime' | 'onlineTime', current: TimeKey): string {
  return TIME_ORDER.map((t) => chipButton(
    set, t,
    t === 'none' ? 'Untimed' : TIME_PRESETS[t].label,
    current === t,
    t === 'none' ? 'Until mate' : TIME_PRESETS[t].note,
  )).join('');
}
function roomListHtml(): string {
  if (!hasSupabase()) return '<div class="room-empty">Cross-device play needs Supabase keys. Use two tabs on this device to test.</div>';
  if (menuRoomsStatus === 'idle' || menuRoomsStatus === 'loading') return '<div class="room-empty">Searching the realm…</div>';
  if (menuRoomsStatus === 'error') return `<div class="room-empty">Could not load rooms: ${escHtml(menuRoomsError)}</div>`;
  if (!menuRooms.length) return '<div class="room-empty">No open rooms. Create one!</div>';
  return `<div class="room-list">${menuRooms.map((r) => `<div class="room"><span class="room-code">${escHtml(r.code)}</span><button class="chip" type="button" data-act="join-room" data-code="${escHtml(r.code)}">Join</button></div>`).join('')}</div>`;
}
function menuPanelHtml(): string {
  if (menuTab === 'play') {
    return `<h2>Choose your battle</h2>
      <div class="group">
        <h3>Vs computer</h3>
        <p>Challenge the royal strategist.</p>
        <div class="chips">${LEVEL_ORDER.map((l) => chipButton('level', l, MENU_LEVELS[l].label, menuLevel === l)).join('')}</div>
        <div class="hint">${MENU_LEVELS[menuLevel].hint}</div>
      </div>
      <div class="group">
        <h3>Timed match</h3>
        <p>Race against time to claim victory.</p>
        <div class="chips">${timeChips('time', menuTime)}</div>
      </div>
      <div class="group">
        <h3>Play as</h3>
        <p>Choose your side of the board.</p>
        <div class="chips">${SIDE_ORDER.map((s) => chipButton('side', s, cap(s), menuSide === s)).join('')}</div>
      </div>`;
  }
  if (menuTab === 'online') {
    return `<h2>Online match</h2>
      <div class="group">
        <h3>Time control</h3>
        <p>Set the clock for your room.</p>
        <div class="chips">${timeChips('onlineTime', onlineTime)}</div>
      </div>
      <div class="group">
        <h3>Play as</h3>
        <p>Choose your side when you host.</p>
        <div class="chips">${SIDE_ORDER.map((s) => chipButton('onlineSide', s, cap(s), onlineSide === s)).join('')}</div>
        <div class="hint">Joining someone else's room? You take the other side.</div>
      </div>
      <div class="group">
        <h3>Quick match</h3>
        <p>Face challengers across the kingdom.</p>
        <div class="chips">
          <button class="chip start" type="button" data-act="find">Find match</button>
          <button class="chip" type="button" data-act="create">Create room</button>
        </div>
        <div class="hint">Your room: ${timeLabel(onlineTime)} · ${onlineSide === 'random' ? 'Random side' : cap(onlineSide)} · both players must be connected</div>
      </div>
      <div class="group">
        <h3>Join a room</h3>
        <p>Enter the code a friend shared. The host's settings apply.</p>
        <div class="field">
          <input id="menu-room-code" maxlength="6" value="${escHtml(menuRoomCode)}" placeholder="ABC123" aria-label="Room code" autocomplete="off" spellcheck="false">
          <button class="chip" type="button" data-act="join">Join</button>
        </div>
      </div>
      <div class="group">
        <h3>Open rooms</h3>
        <p>Rooms waiting for an opponent. The host's settings apply.</p>
        <div id="menu-room-list">${roomListHtml()}</div>
        ${hasSupabase() ? '<div class="chips"><button class="chip" type="button" data-act="refresh">Refresh</button></div>' : ''}
      </div>`;
  }
  if (menuTab === 'local') {
    return `<h2>Local duel</h2>
      <div class="group">
        <h3>Same screen</h3>
        <p>Challenge a friend beside you.</p>
        <div class="chips"><button class="chip start" type="button" data-act="start-local">Start local game</button></div>
        <div class="hint">Pass the device after each move.</div>
      </div>
      <div class="group">
        <h3>Time control</h3>
        <p>Both armies share this clock.</p>
        <div class="chips">${timeChips('localTime', localTime)}</div>
      </div>
      <div class="group">
        <h3>Play as</h3>
        <p>Choose the side facing you.</p>
        <div class="chips">${SIDE_ORDER.map((s) => chipButton('localSide', s, cap(s), localSide === s)).join('')}</div>
        <div class="hint">Both players share this device; this sets the board view.</div>
      </div>`;
  }
  if (menuTab === 'skins') {
    const swatch = (s: string) => `#${SKINS[s].effectColor.toString(16).padStart(6, '0')}`;
    const chips = (key: 'skin' | 'board', current: string) => SKIN_NAMES.map((s) =>
      `<button class="chip" type="button" data-set="${key}" data-val="${s}" aria-pressed="${current === s}"><span class="swatch" style="background:${swatch(s)}"></span>${cap(s)}</button>`).join('');
    return `<h2>Skins &amp; boards</h2>
      <div class="group">
        <h3>Piece skin</h3>
        <p>How your army looks.</p>
        <div class="chips">${chips('skin', pieceSkin)}</div>
      </div>
      <div class="group">
        <h3>Battlefield</h3>
        <p>Where the fight happens.</p>
        <div class="chips">${chips('board', boardSkin)}</div>
      </div>
      <div class="hint">Drag the preview to inspect your army.</div>`;
  }
  const pixel = ctx.graphicsMode() === 'pixel';
  return `<h2>Settings</h2>
    <label class="row">Sound effects<input type="checkbox" data-check="sound" ${volumeOn ? 'checked' : ''}></label>
    <div class="group" style="margin-top:16px">
      <h3>Graphics</h3>
      <p>Rendering style.</p>
      <div class="chips">
        ${chipButton('gfx', 'smooth', 'Smooth', !pixel)}
        ${chipButton('gfx', 'pixel', 'Pixelated', pixel)}
      </div>
      ${pixel ? `<div class="field pixel-fields">
        <label>W <input id="menu-pw" type="number" min="240" max="1920" value="${settings.width}"></label>
        <label>H <input id="menu-ph" type="number" min="180" max="1080" value="${settings.height}"></label>
      </div>` : ''}
    </div>
    <div class="group">
      <h3>Cinematics</h3>
      <p>Capture animations.</p>
      <div class="chips">
        ${chipButton('cine', 'on', 'Full', cinematicsMode === 'on')}
        ${chipButton('cine', 'short', 'Short', cinematicsMode === 'short')}
        ${chipButton('cine', 'off', 'Off', cinematicsMode === 'off')}
      </div>
    </div>
    <div class="chips"><button class="chip" type="button" data-act="reset-settings">Reset defaults</button></div>`;
}
function menuSummary(): string {
  if (menuTab === 'play') return `Vs computer · ${MENU_LEVELS[menuLevel].label} · ${timeLabel(menuTime)} · ${cap(menuSide)}`;
  if (menuTab === 'online') return `Online · ${timeLabel(onlineTime)} · ${cap(onlineSide)}`;
  if (menuTab === 'local') return `Local duel · ${timeLabel(localTime)} · ${cap(localSide)} view`;
  if (menuTab === 'skins') return `${cap(pieceSkin)} pieces · ${cap(boardSkin)} board`;
  return `${ctx.graphicsMode() === 'pixel' ? 'Pixelated' : 'Smooth'} · Cinematics ${cinematicsMode} · Sound ${volumeOn ? 'on' : 'off'}`;
}
function ctaLabel(): string {
  if (menuTab === 'online') return 'Create room';
  if (menuTab === 'local') return 'Begin local duel';
  return 'Begin your quest';
}
function updateMenuChrome(): void {
  if (!menuRoot) return;
  const begin = menuRoot.querySelector('#menu-begin') as HTMLButtonElement | null;
  const summary = menuRoot.querySelector('#menu-summary') as HTMLElement | null;
  if (begin) begin.textContent = ctaLabel();
  if (summary) summary.textContent = menuSummary();
}
function renderMenu(focusSel?: string): void {
  if (!menuRoot || !document.body.contains(menuRoot)) return;
  const panel = menuRoot.querySelector('#menu-panel') as HTMLElement | null;
  const preview = menuRoot.querySelector('#menu-preview') as HTMLElement | null;
  if (!panel || !preview) return;

  menuRoot.querySelectorAll<HTMLButtonElement>('#menu-nav [data-tab]').forEach((b) => {
    const active = b.dataset.tab === menuTab;
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  panel.setAttribute('aria-labelledby', `tab-${menuTab}`);

  panel.innerHTML = menuPanelHtml();
  panel.classList.remove('panel-in');
  void panel.offsetWidth;
  panel.classList.add('panel-in');
  updateMenuChrome();

  const showPreview = menuTab === 'skins';
  preview.hidden = !showPreview;
  if (showPreview) ensureSkinPreview();
  else disposeSkinPreview();

  if (focusSel) {
    const el = menuRoot.querySelector(focusSel) as HTMLElement | null;
    el?.focus();
  }
}
function selectMenuTab(tab: MenuTab): void {
  const item = MENU_ITEMS.find((i) => i.id === tab);
  if (!item || item.disabled) return;
  SFX.click();
  menuTab = tab;
  renderMenu();
  if (tab === 'online' && menuRoomsStatus !== 'loading') void loadMenuRooms();
}
function applyMenuSetting(key: string, val: string): void {
  switch (key) {
    case 'level': menuLevel = val as MenuLevel; break;
    case 'time': menuTime = val as TimeKey; break;
    case 'side': menuSide = val as SideChoice; break;
    case 'localTime': localTime = val as TimeKey; break;
    case 'localSide': localSide = val as SideChoice; break;
    case 'onlineTime': onlineTime = val as TimeKey; break;
    case 'onlineSide': onlineSide = val as SideChoice; break;
    case 'skin':
      pieceSkin = val;
      localStorage.setItem('ptk_pieceSkin', pieceSkin);
      break;
    case 'board':
      boardSkin = val;
      localStorage.setItem('ptk_boardSkin', boardSkin);
      break;
    case 'gfx':
      ctx.applyGraphicsMode(val as 'smooth' | 'pixel');
      saveSettings(settings);
      showToast(val === 'pixel' ? 'Graphics: pixelated' : 'Graphics: smooth');
      break;
    case 'cine':
      cinematicsMode = val as 'on' | 'short' | 'off';
      localStorage.setItem('ptk_cine', cinematicsMode);
      showToast(`Cinematics: ${val}`);
      break;
    default: return;
  }
  SFX.click();
  renderMenu(`[data-set="${key}"][data-val="${val}"]`);
}
function onMenuClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest('[data-tab], [data-set], [data-act]') as HTMLElement | null;
  if (!el) return;
  if (el instanceof HTMLButtonElement && el.disabled) return;

  const tab = el.dataset.tab;
  if (tab) { selectMenuTab(tab as MenuTab); return; }
  if (el.dataset.set) { applyMenuSetting(el.dataset.set, el.dataset.val || ''); return; }

  switch (el.dataset.act) {
    case 'begin': beginFromMenu(); break;
    case 'start-local': startLocalGame(); break;
    case 'create': void createRoomAndStart(); break;
    case 'find': void findMatch(); break;
    case 'join': joinFromCode(); break;
    case 'join-room': void joinRoomAndStart(el.dataset.code || ''); break;
    case 'refresh': void loadMenuRooms(); break;
    case 'reset-settings': resetMenuSettings(); break;
    default: break;
  }
}
function onMenuChange(e: Event): void {
  const t = e.target as HTMLInputElement;
  if (t.dataset.check === 'sound') {
    volumeOn = t.checked;
    localStorage.setItem('ptk_vol', volumeOn ? '1' : '0');
    SFX.setMuted(!volumeOn);
    showToast(volumeOn ? 'Sound on' : 'Sound off');
    updateMenuChrome();
    return;
  }
  if (t.id === 'menu-pw' || t.id === 'menu-ph') {
    const pw = menuRoot?.querySelector('#menu-pw') as HTMLInputElement | null;
    const ph = menuRoot?.querySelector('#menu-ph') as HTMLInputElement | null;
    settings.width = Math.min(1920, Math.max(240, parseInt(pw?.value || '640', 10) || 640));
    settings.height = Math.min(1080, Math.max(180, parseInt(ph?.value || '360', 10) || 360));
    saveSettings(settings);
    if (ctx.graphicsMode() === 'pixel') ctx.applyPixelSize(settings.width, settings.height);
    if (pw) pw.value = String(settings.width);
    if (ph) ph.value = String(settings.height);
    showToast(`Pixel size: ${settings.width} × ${settings.height}`);
  }
}
function onMenuInput(e: Event): void {
  const t = e.target as HTMLInputElement;
  if (t.id === 'menu-room-code') {
    const cleaned = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    menuRoomCode = cleaned;
    if (t.value !== cleaned) t.value = cleaned;
  }
}
function onMenuKeydown(e: KeyboardEvent): void {
  if (!(e.target as HTMLElement).closest('#menu-nav')) return;
  if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  const buttons = Array.from(menuRoot?.querySelectorAll<HTMLButtonElement>('#menu-nav button[role="tab"]:not(:disabled)') || []);
  const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (idx < 0) return;
  e.preventDefault();
  let next = idx;
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = buttons.length - 1;
  else {
    const dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
    next = (idx + dir + buttons.length) % buttons.length;
  }
  buttons[next].focus();
  selectMenuTab(buttons[next].dataset.tab as MenuTab);
}
function updateRoomList(): void {
  const list = menuRoot?.querySelector('#menu-room-list');
  if (list) list.innerHTML = roomListHtml();
}
async function loadMenuRooms(): Promise<void> {
  if (!hasSupabase()) { menuRoomsStatus = 'ready'; menuRooms = []; updateRoomList(); return; }
  menuRoomsStatus = 'loading';
  menuRoomsError = '';
  updateRoomList();
  adapter = createAdapter();
  try {
    menuRooms = await adapter.listOpenRooms();
    menuRoomsStatus = 'ready';
  } catch (e) {
    menuRoomsStatus = 'error';
    menuRoomsError = (e as Error).message || 'unknown error';
  }
  updateRoomList();
}
async function findMatch(): Promise<void> {
  SFX.click();
  showToast('Searching for an opponent…');
  await loadMenuRooms();
  if (menuTab !== 'online') return;
  if (menuRooms.length) { await joinRoomAndStart(menuRooms[0].code); return; }
  await createRoomAndStart();
}
function joinFromCode(): void {
  const input = menuRoot?.querySelector('#menu-room-code') as HTMLInputElement | null;
  const code = (input?.value || menuRoomCode).trim().toUpperCase();
  if (code.length < 4) { showToast('Enter a room code first.'); input?.focus(); return; }
  void joinRoomAndStart(code);
}
async function joinRoomAndStart(code: string): Promise<void> {
  if (!code || roomSetupBusy) return;
  roomSetupBusy = true;
  SFX.click();
  showToast(`Joining room ${code}…`);
  adapter = createAdapter();
  let info: RoomSettings;
  try {
    info = await adapter.joinRoom(code.toUpperCase());
  } catch (e) {
    roomSetupBusy = false;
    adapter.disconnect();
    showToast('Could not join room: ' + ((e as Error).message || 'unknown error'), 5000);
    return;
  }
  roomSetupBusy = false;
  const guestColor: 'w' | 'b' = info.hostColor === 'w' ? 'b' : 'w';
  playerColor = guestColor;
  onlineInitialMs = info.initialMs;
  onlineIncMs = info.incrementMs;
  menuRoomCode = '';
  gameMode = 'online';
  clockEnabled = onlineInitialMs > 0;
  pendingMoves = [];
  setupOnlineHandlers();
  showToast(`Joined ${code.toUpperCase()} · ${roomTimeLabel(info.initialMs, info.incrementMs)} · You are ${guestColor === 'w' ? 'White' : 'Black'}`, 3000);
  startGame();
}
async function createRoomAndStart(): Promise<void> {
  if (roomSetupBusy) return;
  roomSetupBusy = true;
  SFX.click();
  showToast('Opening room…');
  const side: 'w' | 'b' = onlineSide === 'black' ? 'b' : onlineSide === 'white' ? 'w' : (Math.random() < 0.5 ? 'w' : 'b');
  const preset = timePresetOf(onlineTime);
  const initialMs = onlineTime === 'none' ? 0 : Math.round(preset.min * 60000);
  const incrementMs = Math.round(preset.inc * 1000);
  playerColor = side;
  onlineInitialMs = initialMs;
  onlineIncMs = incrementMs;
  adapter = createAdapter();
  pendingMoves = [];
  let code = '';
  try {
    code = await adapter.createRoom({ hostColor: side, initialMs, incrementMs });
  } catch (e) {
    roomSetupBusy = false;
    // Do not leave a room whose host never managed to subscribe.
    void adapter.closeRoom().catch(() => {});
    adapter.disconnect();
    showToast('Could not create room: ' + ((e as Error).message || 'unknown error'), 5000);
    return;
  }
  roomSetupBusy = false;
  const wait = overlay(`
    <div class="menu-card">
      <div class="title">WAITING</div>
      <div class="wait-code">ROOM CODE <strong>${escHtml(code)}</strong></div>
      <div class="wait-note">${timeLabel(onlineTime)} · You play ${side === 'w' ? 'White' : 'Black'}.<br>Share this code. The game starts when your opponent joins.</div>
      <button data-act="cancel">CANCEL</button>
    </div>`);
  gameMode = 'online';
  clockEnabled = initialMs > 0;
  setupOnlineHandlers();
  let began = false;
  adapter.onOpponent((present) => {
    if (!present || began) return;
    began = true;
    clearOverlays();
    startGame();
  });
  wait.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
    SFX.click();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      adapter = null;
      clearOverlays();
      menuTab = 'online';
      showMenu();
      void loadMenuRooms();
    };
    const ad = adapter;
    if (ad) {
      // Close first so the refreshed lobby does not show this empty room.
      void ad.closeRoom().catch(() => {}).finally(() => { ad.disconnect(); finish(); });
    } else {
      finish();
    }
  });
}
function beginFromMenu(): void {
  SFX.click();
  if (menuTab === 'online') { void createRoomAndStart(); return; }
  if (menuTab === 'local') { startLocalGame(); return; }
  gameMode = 'ai';
  clockEnabled = menuTime !== 'none';
  timedPreset = timePresetOf(menuTime);
  difficulty = (menuLevel === 'expert' ? 'hard' : menuLevel) as Difficulty;
  playerColor = menuSide === 'black' ? 'b' : menuSide === 'white' ? 'w' : (Math.random() < 0.5 ? 'w' : 'b');
  startGame();
}
function startLocalGame(): void {
  SFX.click();
  gameMode = localTime === 'none' ? 'classic' : 'timed';
  clockEnabled = localTime !== 'none';
  timedPreset = timePresetOf(localTime);
  playerColor = localSide === 'black' ? 'b' : localSide === 'white' ? 'w' : (Math.random() < 0.5 ? 'w' : 'b');
  startGame();
}
function resetMenuSettings(): void {
  SFX.click();
  settings = { width: 640, height: 360, posterize: false, outline: false };
  saveSettings(settings);
  ctx.applyGraphicsMode('smooth');
  cinematicsMode = 'on';
  localStorage.setItem('ptk_cine', 'on');
  volumeOn = true;
  localStorage.setItem('ptk_vol', '1');
  SFX.setMuted(false);
  showToast('Settings reset to defaults.');
  renderMenu();
}
function showMenu() {
  screen = 'menu';
  paused = false;
  introActive = false;
  cinematicActive = false;
  flushPendingCapture = null;
  gameSession++;
  pendingMoves = [];
  if (clock) { clock.stop(); clock = null; }
  if (ai) { ai.terminate(); ai = null; }
  if (hudInterval) { clearInterval(hudInterval); hudInterval = null; }
  teardownOnline();
  document.querySelectorAll('.hud-buttons, .game-menu-btn, .game-cam-btn').forEach((e) => e.remove());
  document.getElementById('gamehud')?.remove();

  const o = overlay(`
    <div class="main-menu">
      <div class="stage">
        <section class="left">
          <div class="logo">
            <h1>Protect<br>the King</h1>
            <small>A ROYAL CHESS BATTLE</small>
          </div>
          <nav id="menu-nav" role="tablist" aria-label="Main menu">${navHtml()}</nav>
        </section>
        <section class="preview-col" id="menu-preview" hidden>
          <div class="preview-card">
            <div class="preview-title">ARMY PREVIEW</div>
            <canvas id="skinpreview" width="420" height="320"></canvas>
            <div class="preview-label" id="skinlabel"></div>
          </div>
        </section>
        <section class="panel" id="menu-panel" role="tabpanel" aria-live="polite"></section>
        <div class="cta">
          <button id="menu-begin" class="cta-btn" type="button" data-act="begin">Begin your quest</button>
          <div class="summary" id="menu-summary"></div>
        </div>
      </div>
    </div>`);

  menuRoot = o;
  skinPreviewCanvas = o.querySelector('#skinpreview') as HTMLCanvasElement;
  skinPreviewLabel = o.querySelector('#skinlabel') as HTMLDivElement;
  o.addEventListener('click', onMenuClick);
  o.addEventListener('change', onMenuChange);
  o.addEventListener('input', onMenuInput);
  o.addEventListener('keydown', onMenuKeydown);
  renderMenu();
  if (menuTab === 'online') void loadMenuRooms();
}

function setupOnlineHandlers() {
  if (!adapter) return;
  adapter.onMove((m: NetMove) => {
    if (!game || !boardView) { pendingMoves.push(m); return; }
    const mv = game.move(m.from, m.to, m.promotion);
    if (mv) {
      // Adopt the sender's clock snapshot BEFORE switchTo adds this move's increment.
      if (clock && m.whiteMs != null && m.blackMs != null) {
        clock.whiteMs = m.whiteMs;
        clock.blackMs = m.blackMs;
      }
      remoteMove = true;
      applyMoveToBoard(m.from, m.to, mv, !!mv.flags?.includes('c') || !!mv.flags?.includes('e'));
      remoteMove = false;
    } else if (game.fen() !== m.fen) {
      console.warn('online: move illegal/out of sync', { from: m.from, to: m.to, turn: game.turn(), fen: game.fen(), targetFen: m.fen });
      if (clock && m.whiteMs != null && m.blackMs != null) {
        clock.whiteMs = m.whiteMs;
        clock.blackMs = m.blackMs;
      }
      game.load(m.fen);
      boardView.loadPosition(m.fen).then(() => {
        boardView!.showLastMove(m.from, m.to);
        updateHUD();
      });
      checkEndAndAI();
    }
    // When mv was applied, applyMoveToBoard() already ran checkEndAndAI().
  });
  adapter.onClock((w: number, b: number) => {
    if (!clock) return;
    clock.whiteMs = w;
    clock.blackMs = b;
  });
  adapter.onOpponent((_present: boolean) => {
    // Opponent presence is surfaced through the join handshake (see createRoomAndStart).
  });
  adapter.onResign(() => { endGame('Opponent resigned. You win!'); });
  adapter.onDrawOffer(() => { showConfirm('Draw offered. Accept?', () => endGame('Draw agreed.')); });
}

let skinPreviewRenderer: THREE.WebGLRenderer | null = null;
let skinPreviewAnimId = 0;
let skinPreviewCanvas: HTMLCanvasElement | null = null;
let skinPreviewLabel: HTMLDivElement | null = null;
let skinPreviewKey = '';
let skinPreviewToken = 0;

/** Stops the preview loop and releases its renderer. Also aborts any in-flight build. */
function disposeSkinPreview(): void {
  skinPreviewToken++;
  skinPreviewKey = '';
  if (skinPreviewAnimId) { cancelAnimationFrame(skinPreviewAnimId); skinPreviewAnimId = 0; }
  if (skinPreviewRenderer) { skinPreviewRenderer.dispose(); skinPreviewRenderer = null; }
}

/** Builds (or reuses) the 3D army preview shown on the Skins & Boards tab. */
function ensureSkinPreview(): void {
  if (!skinPreviewCanvas) return;
  const key = `${pieceSkin}/${boardSkin}`;
  if (skinPreviewKey === key) return;
  disposeSkinPreview();
  skinPreviewKey = key;
  void startSkinPreview(skinPreviewCanvas, key, skinPreviewToken);
}

async function startSkinPreview(canvas: HTMLCanvasElement, _key: string, token: number): Promise<void> {
  const piece = pieceSkin;
  const board = boardSkin;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.width, canvas.height, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKINS[board].backgroundColor);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5, 10, 5);
  scene.add(dir);
  const cam = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100);
  cam.position.set(9, 7, 9);
  cam.lookAt(0, 0.5, 0);
  const group = new THREE.Group();
  const bv = new BoardView(group, piece);
  bv.setSkin(piece);
  try {
    await bv.loadBoard(SKINS[board].boardPath);
    if (token !== skinPreviewToken) { renderer.dispose(); return; }
    await bv.placeStart();
  } catch {
    if (token === skinPreviewToken) skinPreviewKey = '';
    renderer.dispose();
    return;
  }
  if (token !== skinPreviewToken) { renderer.dispose(); return; }
  scene.add(group);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.target.set(0, 0.5, 0);
  controls.update();
  const loop = () => {
    if (token !== skinPreviewToken) return;
    controls.update();
    renderer.render(scene, cam);
    skinPreviewAnimId = requestAnimationFrame(loop);
  };
  loop();
  skinPreviewRenderer = renderer;
  if (skinPreviewLabel) skinPreviewLabel.textContent = `${piece.toUpperCase()} / ${board.toUpperCase()}`;
}

function showBattleIntro() {
  introActive = true;
  const el = document.createElement('div');
  el.className = 'battle-intro';
  el.innerHTML = `<div class="bi-title">THE BATTLE BEGINS</div><div class="bi-sub">PROTECT YOUR KING</div>`;
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); introActive = false; }, 2400);
}

function isMultiplayer(): boolean { return gameMode === 'online'; }

/** Ends the online session (no-op for local/AI games). */
function teardownOnline(): void {
  if (gameMode === 'online' && adapter) { adapter.disconnect(); adapter = null; }
}

function showGameMenuButton() {
  document.querySelectorAll('.hud-buttons, .game-menu-btn, .game-cam-btn').forEach((e) => e.remove());
  const controls = document.createElement('div');
  controls.className = 'hud-buttons';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Game controls');
  controls.innerHTML = `
    <button class="hud-btn" id="btn-menu" type="button">
      <svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <rect x="1" y="2" width="8" height="1.5"/><rect x="1" y="4.25" width="8" height="1.5"/><rect x="1" y="6.5" width="8" height="1.5"/>
      </svg>
      Menu
    </button>
    <button class="hud-btn" id="btn-reset-view" type="button">
      <svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <rect x="3" y="1" width="4" height="1.2"/><rect x="2" y="2.2" width="1.2" height="1.2"/><rect x="6.8" y="2.2" width="1.2" height="1.2"/>
        <rect x="0.8" y="3.4" width="1.2" height="3.2"/><rect x="8" y="3.4" width="1.2" height="3.2"/>
        <rect x="2" y="6.6" width="1.2" height="1.2"/><rect x="6.8" y="6.6" width="1.2" height="1.2"/><rect x="3" y="7.8" width="4" height="1.2"/>
        <rect x="4.2" y="4.2" width="1.6" height="1.6"/>
      </svg>
      Reset view
    </button>`;
  controls.querySelector('#btn-menu')?.addEventListener('click', () => {
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
      o.querySelector('[data-act="leave"]')?.addEventListener('click', () => { SFX.click(); adapter?.disconnect(); showMenu(); });
      o.querySelector('[data-act="cancel"]')?.addEventListener('click', () => { SFX.click(); clearOverlays(); });
    } else {
      togglePause();
    }
  });
  controls.querySelector('#btn-reset-view')?.addEventListener('click', () => {
    SFX.click();
    ctx.resetView(playerColor === 'b');
  });
  document.body.appendChild(controls);
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
  gameSession++;
  screen = 'game';
  clearOverlays();
  game = new ChessGame();
  boardView = new BoardView(ctx.group, pieceSkin);
  // clear group
  while (ctx.group.children.length) ctx.group.remove(ctx.group.children[0]);
  ctx.group.add(boardView.markerGroup);
  moveHistory = []; capturedBy = { w: [], b: [] }; gameOver = false; selected = null; cinematicActive = false;

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
  if (clock) { clock.stop(); clock = null; }
  if (clockEnabled) {
    // Online uses the host-chosen room clock; other modes use the menu preset.
    const preset = gameMode === 'online'
      ? { min: onlineInitialMs / 60000, inc: onlineIncMs / 1000 }
      : timedPreset;
    clock = new Clock(preset.min, preset.inc);
    clock.onFlag = (color) => endGame(color === 'w' ? 'Black wins on time' : 'White wins on time');
  } else {
    clock = null;
  }

  // HUD container
  ensureHUD();
  updateHUD();
  hudUpdateTurn();
  // drain any moves that arrived before the game was ready
  if (pendingMoves.length) {
    const queued = pendingMoves.splice(0);
    for (const m of queued) {
      const mv = game!.move(m.from, m.to, m.promotion);
      if (mv) {
        if (clock && m.whiteMs != null && m.blackMs != null) { clock.whiteMs = m.whiteMs; clock.blackMs = m.blackMs; }
        remoteMove = true;
        applyMoveToBoard(m.from, m.to, mv, !!mv.flags?.includes('c') || !!mv.flags?.includes('e'));
        remoteMove = false;
      } else if (game!.fen() !== m.fen) {
        if (clock && m.whiteMs != null && m.blackMs != null) { clock.whiteMs = m.whiteMs; clock.blackMs = m.blackMs; }
        game!.load(m.fen);
        boardView!.loadPosition(m.fen).then(() => { boardView!.showLastMove(m.from, m.to); updateHUD(); });
        checkEndAndAI();
      }
    }
  }
  if (playerColor === 'b') ctx.resetView(true);
  else ctx.resetView(false);

  // Battle intro animation
  showBattleIntro();
  // In-game menu button
  showGameMenuButton();

  // When the player chose Black, the computer opens the game after the intro.
  if (gameMode === 'ai' && game && game.turn() !== playerColor && !gameOver) {
    setTimeout(() => {
      if (gameMode === 'ai' && game && game.turn() !== playerColor && !gameOver && !paused) void doAIMove();
    }, 2600);
  }
}

function ensureHUD() {
  if (hudInterval) { clearInterval(hudInterval); hudInterval = null; }
  document.getElementById('gamehud')?.remove();
  const h = document.createElement('aside');
  h.id = 'gamehud';
  h.classList.toggle('untimed', !clock);
  h.setAttribute('aria-label', 'Game panel');
  const clockW = clock ? clock.format(clock.whiteMs) : '';
  const clockB = clock ? clock.format(clock.blackMs) : '';
  h.innerHTML = `
    <h1 class="side-title">
      <svg viewBox="0 0 11 9" fill="currentColor" aria-hidden="true">
        <rect x="0" y="1" width="1" height="1"/><rect x="5" y="0" width="1" height="1"/><rect x="10" y="1" width="1" height="1"/>
        <rect x="0" y="2" width="2" height="1"/><rect x="4" y="1" width="3" height="1"/><rect x="9" y="2" width="2" height="1"/>
        <rect x="0" y="3" width="11" height="3"/><rect x="1" y="6" width="9" height="1"/><rect x="1" y="8" width="9" height="1"/>
      </svg>
      Protect the King
    </h1>
    <div class="players">
      <div class="player" id="cardB">
        <div class="player-chip black" aria-hidden="true">♚</div>
        <div class="who"><b>Black</b><div class="tray" id="trayB" role="img" aria-label="Black has no captures"></div></div>
        <div class="clock" id="clkB" aria-label="Black clock">${clockB}</div>
      </div>
      <div class="player" id="cardW">
        <div class="player-chip white" aria-hidden="true">♔</div>
        <div class="who"><b>White</b><div class="tray" id="trayW" role="img" aria-label="White has no captures"></div></div>
        <div class="clock" id="clkW" aria-label="White clock">${clockW}</div>
      </div>
    </div>
    <div class="status" id="turn" data-turn="white" role="status" aria-live="polite" aria-atomic="true">
      <i aria-hidden="true"></i><span id="turn-text">White to move</span>
    </div>
    <div class="moves-section" id="moves-section">
      <h2 class="sec-head" id="moves-heading">Moves</h2>
      <div class="moves" id="movelist" role="log" aria-live="polite" aria-labelledby="moves-heading"></div>
    </div>`;
  document.body.appendChild(h);
  hudInterval = setInterval(() => {
    if (!clock || gameOver || paused) return;
    const w = document.getElementById('clkW');
    const b = document.getElementById('clkB');
    if (w) {
      w.textContent = clock.format(clock.whiteMs);
      w.classList.toggle('low', clock.whiteMs <= 30_000);
    }
    if (b) {
      b.textContent = clock.format(clock.blackMs);
      b.classList.toggle('low', clock.blackMs <= 30_000);
    }
  }, 200);
}

const PIECE_SYMBOL: Record<string, string> = { pawn: '♟', knight: '♞', bishop: '♝', rook: '♜', queen: '♛', king: '♚' };
function renderCapturedTray(el: HTMLElement, pieces: CapturedPiece[], side: 'White' | 'Black'): void {
  el.innerHTML = pieces
    .map((p) => `<span class="cap-piece ${p.color}" aria-hidden="true" title="${p.color} ${p.type}">${PIECE_SYMBOL[p.type] || ''}</span>`)
    .join('');
  const label = pieces.length
    ? `${side} captured: ${pieces.map((p) => p.type).join(', ')}`
    : `${side} has no captures`;
  el.setAttribute('aria-label', label);
}
function updateHUD() {
  const ml = document.getElementById('movelist');
  if (ml) {
    let html = '';
    for (let i = 0; i < moveHistory.length; i += 2) {
      const n = Math.floor(i / 2) + 1;
      const w = moveHistory[i] || '';
      const b = moveHistory[i + 1] || '';
      const lastW = i === moveHistory.length - 1;
      const lastB = i + 1 === moveHistory.length - 1;
      html += `<div class="mv-row"><span class="n">${n}.</span><span class="w${lastW ? ' last' : ''}">${w}</span><span class="b${lastB ? ' last' : ''}">${b}</span></div>`;
    }
    ml.innerHTML = html || '<div class="moves-empty" aria-hidden="true">Moves will appear here.</div>';
    ml.scrollTop = ml.scrollHeight;
  }
  const trayW = document.getElementById('trayW');
  if (trayW) renderCapturedTray(trayW, capturedBy.w, 'White');
  const trayB = document.getElementById('trayB');
  if (trayB) renderCapturedTray(trayB, capturedBy.b, 'Black');
}

// ---- Move application ----
function applyMoveToBoard(from: string, to: string, mv: any, _isCapture: boolean) {
  // If a capture cinematic is still playing, finalize it first so this move is
  // applied to an up-to-date board (catch-up bursts can deliver several moves).
  if (flushPendingCapture) { const flush = flushPendingCapture; flushPendingCapture = null; flush(); }
  const piece = boardView!.getPieceAt(from);
  const victim = boardView!.getPieceAt(to);
  const isCaptureMove = !!victim || mv.flags?.includes('c') || mv.flags?.includes('e');
  const pieceType = piece?.type || 'pawn';
  const promo = mv.promotion;
  const wasRemote = remoteMove;
  const session = gameSession;

  const doApply = () => {
    if (session !== gameSession) return; // a late callback from a previous game
    clock?.resume();
    if (isCaptureMove) {
      const mover = (mv.color === 'b' ? 'b' : 'w') as 'w' | 'b';
      if (victim) capturedBy[mover].push({ type: victim.type, color: victim.color });
      else if (mv.flags?.includes('e')) capturedBy[mover].push({ type: 'pawn', color: mover === 'w' ? 'black' : 'white' });
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
    // The move payload carries the pre-increment clock snapshot; the receiver
    // adopts it and applies the same increment, so a second clock broadcast
    // would overwrite that increment with stale values.
    if (gameMode === 'online' && adapter && !wasRemote) adapter.sendMove({ from, to, promotion: mv.promotion, fen: game!.fen(), whiteMs: clock?.whiteMs, blackMs: clock?.blackMs });
    updateHUD();
    SFX.move();
    if (mv.san.includes('+') || mv.san.includes('#')) { SFX.check(); }
  };

  const cinematicsOn = cinematicsMode !== 'off' && isCaptureMove;
  const shortMode = cinematicsMode === 'short' || (clockEnabled && gameMode !== 'online');
  if (cinematicsOn && piece) {
    const victimMesh = victim?.mesh || null;
    // freeze the clock and input while the capture cinematic plays
    clock?.pause();
    cinematicActive = true;
    // Runs exactly once — whether the animation finishes, fails, or stalls
    // (rAF is suspended while a tab is hidden, which used to leave the move
    // half-applied and get re-sent much later).
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (flushPendingCapture === finish) flushPendingCapture = null;
      if (session !== gameSession) return;
      cinematicActive = false;
      doApply();
      checkEndAndAI();
    };
    flushPendingCapture = finish;
    playCapture(
      { scene: ctx.scene, camera: ctx.camera, controls: ctx.controls, group: ctx.group },
      piece.mesh,
      victimMesh,
      from, to, pieceType,
      SKINS[pieceSkin].effectColor,
      shortMode,
    ).then(finish, finish);
    setTimeout(finish, 4000);
  } else {
    doApply();
    checkEndAndAI();
  }
}

function checkEndAndAI() {
  if (!game) return;
  if (game.isGameOver()) { handleGameOver(); return; }
  if (clock && (clockEnabled || gameMode === 'online')) {
    if (!clock.started && moveHistory.length >= 1) {
      // White always opens; give that move its increment, then start the reply clock.
      clock.whiteMs += clock.incrementMs;
      clock.start(game.turn() === 'w' ? 'w' : 'b');
    } else {
      clock.switchTo(game.turn() === 'w' ? 'w' : 'b');
    }
  }
  // AI move
  const aiTurn = gameMode === 'ai' && game.turn() !== playerColor && !gameOver && !paused;
  hudUpdateTurn();
  if (aiTurn) {
    const turnText = document.getElementById('turn-text');
    if (turnText) turnText.textContent = 'AI thinking…';
    setTimeout(() => { if (!paused) doAIMove(); }, 300);
  }
}

function hudUpdateTurn() {
  if (!game) return;
  const isWhite = game.turn() === 'w';
  const isCheck = game.isCheck();
  const turnEl = document.getElementById('turn');
  const turnText = document.getElementById('turn-text');
  if (turnEl) {
    turnEl.dataset.turn = isWhite ? 'white' : 'black';
    turnEl.classList.toggle('check', isCheck);
  }
  if (turnText) turnText.textContent = isCheck ? 'Check! Protect the king' : `${isWhite ? 'White' : 'Black'} to move`;
  document.getElementById('cardW')?.classList.toggle('active', isWhite);
  document.getElementById('cardB')?.classList.toggle('active', !isWhite);
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
  teardownOnline();
  if (clock) clock.stop();
  if (hudInterval) { clearInterval(hudInterval); hudInterval = null; }
  document.querySelectorAll('.hud-buttons, .game-menu-btn, .game-cam-btn').forEach((e) => e.remove());
  let msg = 'Game over';
  if (game!.isCheckmate()) msg = `Checkmate! ${game!.turn() === 'w' ? 'Black' : 'White'} wins`;
  else if (game!.isStalemate()) msg = 'Stalemate';
  else if (game!.isDraw()) msg = 'Draw';
  SFX.mate();
  // gameover screen
  const canRematch = gameMode !== 'online';
  const o = overlay(`
    <div class="menu-card">
      <div class="title">${msg.toUpperCase()}</div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">
        ${canRematch ? '<button data-act="rematch">REMATCH</button>' : ''}
        <button data-act="menu">MENU</button>
      </div>
    </div>`);
  o.querySelector('[data-act="rematch"]')?.addEventListener('click', () => { SFX.click(); startGame(); });
  o.querySelector('[data-act="menu"]')?.addEventListener('click', () => { SFX.click(); showMenu(); });
}

function endGame(msg: string) {
  if (gameOver) return;
  gameOver = true;
  teardownOnline();
  if (clock) clock.stop();
  if (hudInterval) { clearInterval(hudInterval); hudInterval = null; }
  document.querySelectorAll('.hud-buttons, .game-menu-btn, .game-cam-btn').forEach((e) => e.remove());
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
  if (screen !== 'game' || gameOver || paused || introActive || cinematicActive) return;
  if (gameMode === 'online' && game && game.turn() !== playerColor[0]) return;
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