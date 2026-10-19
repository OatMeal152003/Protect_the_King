export class Clock {
  whiteMs: number;
  blackMs: number;
  incrementMs: number;
  active: 'w' | 'b' | null = null;
  started = false; // starts after white's first move
  lastTick = 0;
  onFlag: ((color: 'w' | 'b') => void) | null = null;
  private raf = 0;
  private running = false;
  private paused = false;

  constructor(minutes: number, incrementSec: number) {
    this.whiteMs = minutes * 60000;
    this.blackMs = minutes * 60000;
    this.incrementMs = incrementSec * 1000;
  }

  start(color: 'w' | 'b'): void {
    if (!this.started) { this.started = true; }
    this.active = color;
    this.paused = false;
    this.lastTick = Date.now();
    if (!this.running) { this.running = true; this.tick(); }
  }

  switchTo(color: 'w' | 'b'): void {
    // add increment to the player who just moved
    if (this.active === 'w') this.whiteMs += this.incrementMs;
    if (this.active === 'b') this.blackMs += this.incrementMs;
    this.active = color;
    this.paused = false;
    this.lastTick = Date.now();
  }

  /** Freeze accumulation (e.g. while a capture cinematic plays). */
  pause(): void {
    this.paused = true;
    this.lastTick = Date.now();
  }

  /** Resume accumulation from the current instant (no time jump). */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.lastTick = Date.now();
  }

  private tick = (): void => {
    if (!this.running) return;
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    if (!this.paused) {
      if (this.active === 'w') this.whiteMs -= dt;
      else if (this.active === 'b') this.blackMs -= dt;
      if (this.active === 'w' && this.whiteMs <= 0) { this.whiteMs = 0; this.running = false; this.paused = false; this.onFlag?.('w'); return; }
      if (this.active === 'b' && this.blackMs <= 0) { this.blackMs = 0; this.running = false; this.paused = false; this.onFlag?.('b'); return; }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  stop(): void { this.running = false; cancelAnimationFrame(this.raf); }
  format(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}