import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { NetAdapter, NetMove } from './adapter';

/** Clamp + round a millisecond clock value so it satisfies an integer column. */
function toIntMs(v: number | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
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
  /** Moves that arrived before main.ts registered a handler. */
  private queued: NetMove[] = [];
  /** Signatures of moves this client already sent (guards double inserts). */
  private sentSignatures = new Set<string>();

  private moveCb: ((m: NetMove) => void) | null = null;
  private clockCb: ((w: number, b: number) => void) | null = null;
  private oppCb: ((p: boolean) => void) | null = null;
  private drawCb: (() => void) | null = null;
  private resignCb: (() => void) | null = null;

  constructor(url: string, key: string) {
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
  }

  private genCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async createRoom(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.genCode();
      const { error } = await this.supabase.from('rooms').insert({ code, white_present: true, black_present: false });
      if (!error) {
        this.code = code;
        this.subscribe(code);
        return code;
      }
    }
    throw new Error('Failed to create room');
  }

  async joinRoom(code: string): Promise<void> {
    this.code = code.toUpperCase();
    const { data, error } = await this.supabase
      .from('rooms')
      .update({ black_present: true })
      .eq('code', this.code)
      .eq('black_present', false)
      .select('code')
      .single();
    if (error || !data) throw new Error('Room not found or already full');
    this.announceJoin = true;
    this.subscribe(this.code);
  }

  async listOpenRooms(): Promise<{ code: string; created_at: string }[]> {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('rooms')
      .select('code, created_at')
      .eq('black_present', false)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return [];
    return (data || []).map((r: any) => ({ code: r.code, created_at: r.created_at }));
  }

  private subscribe(code: string): void {
    if (this.channel) this.channel.unsubscribe();
    if (this.broadcast) this.broadcast.unsubscribe();
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
        if (row?.black_present) this.oppCb?.(true);
      })
      .subscribe((status: string) => {
        // Realtime does not replay events missed during a disconnect;
        // pull anything we have not seen yet so the game can never deadlock.
        if (status === 'SUBSCRIBED') void this.resync();
      });
    // Broadcast channel for draw/resign and the join handshake
    this.broadcast = this.supabase
      .channel(`events:${code}`)
      .on('broadcast', { event: 'draw' }, () => this.drawCb?.())
      .on('broadcast', { event: 'resign' }, () => this.resignCb?.())
      .on('broadcast', { event: 'join' }, () => this.oppCb?.(true))
      .subscribe((status: string) => {
        // Tell the host we arrived. Some Realtime setups delay the rooms
        // UPDATE event, so the handshake carries the start signal too.
        if (status === 'SUBSCRIBED' && this.announceJoin) {
          this.announceJoin = false;
          void this.broadcast?.send({ type: 'broadcast', event: 'join', payload: {} });
        }
      });
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
    this.clockCb?.(m.whiteMs ?? 0, m.blackMs ?? 0);
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
  onClock(cb: (w: number, b: number) => void): void { this.clockCb = cb; }
  onOpponent(cb: (p: boolean) => void): void { this.oppCb = cb; }
  offerDraw(): void { this.broadcast?.send({ type: 'broadcast', event: 'draw', payload: {} }); }
  resign(): void { this.broadcast?.send({ type: 'broadcast', event: 'resign', payload: {} }); }
  onDrawOffer(cb: () => void): void { this.drawCb = cb; }
  onResign(cb: () => void): void { this.resignCb = cb; }
  disconnect(): void {
    if (this.channel) { this.channel.unsubscribe(); this.channel = null; }
    if (this.broadcast) { this.broadcast.unsubscribe(); this.broadcast = null; }
  }
}