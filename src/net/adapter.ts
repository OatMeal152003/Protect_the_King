export interface NetMove { from: string; to: string; promotion?: string; fen: string; whiteMs?: number; blackMs?: number; }
/** Host-chosen room setup, shared with the joiner during the join handshake. */
export interface RoomSettings { hostColor: 'w' | 'b'; initialMs: number; incrementMs: number; }
export interface NetAdapter {
  createRoom(settings: RoomSettings): Promise<string>;
  joinRoom(code: string): Promise<RoomSettings>;
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
  /** Host only: take a waiting room out of the lobby. */
  closeRoom(): Promise<void>;
  disconnect(): void;
}

// Local adapter using BroadcastChannel (same-browser dev). Room code = channel name.
export class LocalAdapter implements NetAdapter {
  private channel: BroadcastChannel | null = null;
  private code = '';
  private roomSettings: RoomSettings | null = null;
  private pendingInfo: ((s: RoomSettings | null) => void) | null = null;
  private moveCb: ((m: NetMove) => void) | null = null;
  private clockCb: ((w: number, b: number) => void) | null = null;
  private oppCb: ((p: boolean) => void) | null = null;
  private drawCb: (() => void) | null = null;
  private resignCb: (() => void) | null = null;

  async createRoom(settings: RoomSettings): Promise<string> {
    this.roomSettings = settings;
    this.code = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.connect(this.code);
    return this.code;
  }
  async joinRoom(code: string): Promise<RoomSettings> {
    this.code = code.toUpperCase();
    this.roomSettings = null;
    this.connect(this.code);
    const info = await new Promise<RoomSettings | null>((resolve) => {
      this.pendingInfo = resolve;
      this.channel?.postMessage({ type: 'info-request' });
      setTimeout(() => {
        if (this.pendingInfo === resolve) { this.pendingInfo = null; resolve(null); }
      }, 3000);
    });
    if (!info) throw new Error('The host did not answer. Try again.');
    return info;
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
      if (d.type === 'info-request' && this.roomSettings) {
        this.channel?.postMessage({ type: 'info', settings: this.roomSettings });
      }
      if (d.type === 'info' && this.pendingInfo) {
        const resolve = this.pendingInfo;
        this.pendingInfo = null;
        resolve(d.settings);
      }
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
  async closeRoom(): Promise<void> { /* local rooms are ephemeral */ }
  disconnect(): void { this.channel?.close(); this.channel = null; this.pendingInfo = null; }
}
