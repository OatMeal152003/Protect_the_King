export interface NetMove { from: string; to: string; promotion?: string; fen: string; whiteMs?: number; blackMs?: number; }
export interface NetAdapter {
  createRoom(): Promise<string>;
  joinRoom(code: string): Promise<void>;
  listOpenRooms(): Promise<{ code: string; created_at: string }[]>;
  sendMove(m: NetMove): void;
  sendClock(whiteMs: number, blackMs: number): void;
  onMove(cb: (m: NetMove) => void): void;
  onClock(cb: (w: number, b: number) => void): void;
  onOpponent(cb: (present: boolean) => void): void;
  offerDraw(): void;
  resign(): void;
  onDrawOffer(cb: () => void): void;
  onResign(cb: () => void): void;
  disconnect(): void;
}

// Local adapter using BroadcastChannel (same-browser dev). Room code = channel name.
export class LocalAdapter implements NetAdapter {
  private channel: BroadcastChannel | null = null;
  private code = '';
  private moveCb: ((m: NetMove) => void) | null = null;
  private clockCb: ((w: number, b: number) => void) | null = null;
  private oppCb: ((p: boolean) => void) | null = null;
  private drawCb: (() => void) | null = null;
  private resignCb: (() => void) | null = null;

  async createRoom(): Promise<string> {
    this.code = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.connect(this.code);
    return this.code;
  }
  async joinRoom(code: string): Promise<void> {
    this.code = code.toUpperCase();
    this.connect(this.code);
  }
  async listOpenRooms(): Promise<{ code: string; created_at: string }[]> {
    return [];
  }
  private connect(code: string): void {
    this.channel = new BroadcastChannel('ptk-room-' + code);
    this.channel.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === 'move') this.moveCb?.(d.move);
      if (d.type === 'clock') this.clockCb?.(d.w, d.b);
      if (d.type === 'presence') this.oppCb?.(true);
      if (d.type === 'draw') this.drawCb?.();
      if (d.type === 'resign') this.resignCb?.();
    };
    // announce presence
    setTimeout(() => this.channel?.postMessage({ type: 'presence' }), 200);
  }
  sendMove(m: NetMove): void { this.channel?.postMessage({ type: 'move', move: m }); }
  sendClock(w: number, b: number): void { this.channel?.postMessage({ type: 'clock', w, b }); }
  onMove(cb: (m: NetMove) => void): void { this.moveCb = cb; }
  onClock(cb: (w: number, b: number) => void): void { this.clockCb = cb; }
  onOpponent(cb: (p: boolean) => void): void { this.oppCb = cb; }
  offerDraw(): void { this.channel?.postMessage({ type: 'draw' }); }
  resign(): void { this.channel?.postMessage({ type: 'resign' }); }
  onDrawOffer(cb: () => void): void { this.drawCb = cb; }
  onResign(cb: () => void): void { this.resignCb = cb; }
  disconnect(): void { this.channel?.close(); this.channel = null; }
}
