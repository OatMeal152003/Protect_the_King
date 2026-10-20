import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { NetAdapter, NetMove, RoomSettings } from './adapter';

/** Clamp + round a millisecond clock value so it satisfies an integer column. */
function toIntMs(v: number | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
}

function clampTime(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(24 * 60 * 60 * 1000, Math.max(0, Math.round(n)));
}

export class SupabaseAdapter implements NetAdapter {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private broadcast: RealtimeChannel | null = null;
  private code = '';
  private lastSentMove: { from: string; to: string; fen: string } | null = null;
  /** Highest moves.id already seen/emitted — keeps application strictly ordered. */
  private lastRowId = 0;
  /** Room this client is currently subscribed to (cursor reset guard). */
  private subscribedCode = '';
  /** Send a join handshake once the broadcast channel is ready. */
  private announceJoin = false;
  /** Host-chosen setup, broadcast to the joiner so both clients start alike. */
  private isHost = false;
  private roomSettings: RoomSettings | null = null;
  private settingsResolve: ((s: RoomSettings | null) => void) | null = null;
  private broadcastReady = false;
  private roomReady = false;
  /** Resolves once both Realtime channels are subscribed. */
  private readyResolve: (() => void) | null = null;
  /** Moves that arrived before main.ts registered a handler. */
  private queued: NetMove[] = [];
  /** Signatures of moves this client already sent (guards double inserts). */
  private sentSignatures = new Set<string>();

  private moveCb: ((m: NetMove) => void) | null = null;
  private oppCb: ((p: boolean) => void) | null = null;
  private drawCb: (() => void) | null = null;
  private resignCb: (() => void) | null = null;

  constructor(url: string, key: string) {
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
  }

  private genCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async createRoom(settings: RoomSettings): Promise<string> {
    this.isHost = true;
    this.roomSettings = {
      hostColor: settings.hostColor === 'b' ? 'b' : 'w',
      initialMs: clampTime(settings.initialMs),
      incrementMs: Math.min(60 * 60 * 1000, clampTime(settings.incrementMs)),
    };
    this.settingsResolve = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.genCode();
      const { error } = await this.supabase.from('rooms').insert({ code, white_present: true, black_present: false });
      if (!error) {
        this.code = code;
        await this.subscribe(code);
        return code;
      }
    }
    throw new Error('Failed to create room');
  }

  async joinRoom(code: string): Promise<RoomSettings> {
    this.code = code.toUpperCase();
    this.isHost = false;
    this.roomSettings = null;
    this.settingsResolve = null;
    this.announceJoin = false;
    // Subscribe before claiming the seat: the host may answer the join
    // handshake the instant the room row updates.
    await this.subscribe(this.code);
    const { data, error } = await this.supabase
      .from('rooms')
      .update({ black_present: true })
      .eq('code', this.code)
      .eq('black_present', false)
      .select('code')
      .single();
    if (error || !data) {
      this.disconnect();
      throw new Error('Room not found or already full');
    }
    this.announceJoin = true;
    this.sendJoin();
    const info = await this.waitForSettings();
    if (!info) {
      // Give the seat back so the room is joinable again.
      await this.supabase.from('rooms').update({ black_present: false }).eq('code', this.code);
      this.disconnect();
      throw new Error('The host did not answer. Try again.');
    }
    return info;
  }

  private sendJoin(): void {
    if (!this.announceJoin || !this.broadcastReady) return;
    this.announceJoin = false;
    void this.broadcast?.send({ type: 'broadcast', event: 'join', payload: {} });
  }

  /** Repeated so a joiner that subscribed a moment late still catches setup. */
  private sendSettings(): void {
    if (!this.isHost || !this.roomSettings || !this.broadcast) return;
    const channel = this.broadcast;
    const payload = this.roomSettings;
    const fire = () => {
      void channel.send({ type: 'broadcast', event: 'roomsync', payload });
    };
    fire();
    setTimeout(fire, 300);
    setTimeout(fire, 1000);
  }

  private waitForSettings(): Promise<RoomSettings | null> {
    if (this.roomSettings) return Promise.resolve(this.roomSettings);
    return new Promise((resolve) => {
      this.settingsResolve = resolve;
      setTimeout(() => {
        if (this.settingsResolve === resolve) {
          this.settingsResolve = null;
          resolve(null);
        }
      }, 6000);
    });
  }

  async listOpenRooms(): Promise<{ code: string; created_at: string }[]> {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('rooms')
      .select('code, created_at')
      .eq('white_present', true)
      .eq('black_present', false)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return [];
    return (data || []).map((r: any) => ({ code: r.code, created_at: r.created_at }));
  }

  private subscribe(code: string): Promise<void> {
    if (this.channel) this.channel.unsubscribe();
    if (this.broadcast) this.broadcast.unsubscribe();
    this.broadcastReady = false;
    this.roomReady = false;
    const ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      setTimeout(() => {
        if (!this.roomReady || !this.broadcastReady) {
          reject(new Error('Could not connect to the room. Try again.'));
        }
      }, 10000);
    });
    // Reset the row cursor only for a different room; on a reconnect we want
    // to keep it so resync fetches only the moves we actually missed.
    if (this.subscribedCode !== code) {
      this.subscribedCode = code;
      this.lastRowId = 0;
      this.queued = [];
      this.sentSignatures.clear();
    }
    this.lastSentMove = null;

    // Presence + moves via postgres changes
    this.channel = this.supabase
      .channel(`room:${code}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moves', filter: `room_code=eq.${code}` }, (payload: any) => {
        const row = payload.new;
        if (!row || typeof row.id !== 'number') return;
        // Strictly ordered: never apply an older row twice or out of order.
        if (row.id <= this.lastRowId) return;
        this.lastRowId = row.id;
        const move: NetMove = {
          from: row.from_sq,
          to: row.to_sq,
          promotion: row.promotion || undefined,
          fen: row.fen,
          whiteMs: row.white_ms,
          blackMs: row.black_ms,
        };
        if (this.isOwnEcho(move)) return;
        this.emit(move);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, (payload: any) => {
        const row = payload.new;
        if (row?.white_present && row?.black_present) {
          this.oppCb?.(true);
          this.sendSettings();
        }
      })
      .subscribe((status: string) => {
        // Realtime does not replay events missed during a disconnect;
        // pull anything we have not seen yet so the game can never deadlock.
        if (status === 'SUBSCRIBED') {
          this.roomReady = true;
          void this.resync();
          this.checkReady();
        }
      });
    // Broadcast channel for draw/resign, the join handshake, and room setup.
    this.broadcast = this.supabase
      .channel(`events:${code}`)
      .on('broadcast', { event: 'draw' }, () => this.drawCb?.())
      .on('broadcast', { event: 'resign' }, () => this.resignCb?.())
      .on('broadcast', { event: 'join' }, () => {
        // Some Realtime setups delay the rooms UPDATE event, so the handshake
        // carries the start signal and the room setup too.
        this.oppCb?.(true);
        this.sendSettings();
      })
      .on('broadcast', { event: 'roomsync' }, (msg: any) => {
        const p = msg?.payload;
        if (!p || (p.hostColor !== 'w' && p.hostColor !== 'b')) return;
        const settings: RoomSettings = {
          hostColor: p.hostColor,
          initialMs: clampTime(p.initialMs),
          incrementMs: Math.min(60 * 60 * 1000, clampTime(p.incrementMs)),
        };
        this.roomSettings = settings;
        if (this.settingsResolve) {
          const resolve = this.settingsResolve;
          this.settingsResolve = null;
          resolve(settings);
        }
      })
      .subscribe((status: string) => {
        this.broadcastReady = status === 'SUBSCRIBED';
        if (this.broadcastReady) this.sendJoin();
        this.checkReady();
      });
    return ready;
  }

  private checkReady(): void {
    if (this.roomReady && this.broadcastReady && this.readyResolve) {
      const resolve = this.readyResolve;
      this.readyResolve = null;
      resolve();
    }
  }

  private isOwnEcho(m: NetMove): boolean {
    if (!this.lastSentMove) return false;
    const match = m.from === this.lastSentMove.from && m.to === this.lastSentMove.to && m.fen === this.lastSentMove.fen;
    if (match) this.lastSentMove = null;
    return match;
  }

  private emit(m: NetMove): void {
    if (!this.moveCb) { this.queued.push(m); return; }
    this.moveCb(m);
    // Clocks travel inside the move payload and are adopted there, before the
    // receiver applies the increment; a separate callback would undo it.
  }

  /** Apply any moves committed while the channel was down (or before handlers registered). */
  private async resync(): Promise<void> {
    if (!this.code) return;
    const { data, error } = await this.supabase
      .from('moves')
      .select('id,from_sq,to_sq,promotion,fen,white_ms,black_ms')
      .eq('room_code', this.code)
      .gt('id', this.lastRowId)
      .order('id', { ascending: true });
    if (error || !data) return;
    for (const row of data as any[]) {
      if (typeof row.id !== 'number' || row.id <= this.lastRowId) continue;
      this.lastRowId = row.id;
      const move: NetMove = {
        from: row.from_sq,
        to: row.to_sq,
        promotion: row.promotion || undefined,
        fen: row.fen,
        whiteMs: row.white_ms,
        blackMs: row.black_ms,
      };
      if (this.isOwnEcho(move)) continue;
      this.emit(move);
    }
  }

  sendMove(m: NetMove): void {
    // A given (from, to, resulting FEN) is unique within a game; never send it twice.
    const sig = `${m.from}|${m.to}|${m.promotion || ''}|${m.fen}`;
    if (this.sentSignatures.has(sig)) return;
    this.sentSignatures.add(sig);
    this.lastSentMove = { from: m.from, to: m.to, fen: m.fen };
    this.supabase.from('moves').insert({
      room_code: this.code,
      from_sq: m.from,
      to_sq: m.to,
      promotion: m.promotion || null,
      fen: m.fen,
      // Clock values are floats (rAF deltas); the columns are integer.
      white_ms: toIntMs(m.whiteMs),
      black_ms: toIntMs(m.blackMs),
    }).then(({ error }) => {
      if (error) { console.error('sendMove failed', error.message, error.details, error.hint, error.code); this.sentSignatures.delete(sig); }
    });
  }

  sendClock(_w: number, _b: number): void {
    // Clocks now travel with each move; nothing to do here.
  }

  onMove(cb: (m: NetMove) => void): void {
    this.moveCb = cb;
    if (this.queued.length) {
      const backlog = this.queued.splice(0);
      for (const m of backlog) cb(m);
    }
  }
  onClock(_cb: (w: number, b: number) => void): void {
    // Clocks travel with each move row; no separate stream is needed.
  }
  onOpponent(cb: (p: boolean) => void): void { this.oppCb = cb; }
  offerDraw(): void { this.broadcast?.send({ type: 'broadcast', event: 'draw', payload: {} }); }
  resign(): void { this.broadcast?.send({ type: 'broadcast', event: 'resign', payload: {} }); }
  onDrawOffer(cb: () => void): void { this.drawCb = cb; }
  onResign(cb: () => void): void { this.resignCb = cb; }
  async closeRoom(): Promise<void> {
    if (!this.isHost || !this.code) return;
    // Host left + guest seat filled: drops out of listOpenRooms and, crucially,
    // its own UPDATE cannot satisfy the white_present && black_present start check.
    await this.supabase.from('rooms').update({ white_present: false, black_present: true }).eq('code', this.code);
  }

  disconnect(): void {
    if (this.settingsResolve) {
      const resolve = this.settingsResolve;
      this.settingsResolve = null;
      resolve(null);
    }
    this.broadcastReady = false;
    this.announceJoin = false;
    if (this.channel) { this.channel.unsubscribe(); this.channel = null; }
    if (this.broadcast) { this.broadcast.unsubscribe(); this.broadcast = null; }
  }
}