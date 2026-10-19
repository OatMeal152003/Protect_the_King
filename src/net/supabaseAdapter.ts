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
    const { error } = await this.supabase.from('rooms').update({ black_present: true }).eq('code', this.code);
    if (error) throw error;
    this.subscribe(this.code);
  }

  async listOpenRooms(): Promise<{ code: string; created_at: string }[]> {
    const { data, error } = await this.supabase
      .from('rooms')
      .select('code, created_at')
      .eq('black_present', false)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return [];
    return (data || []).map((r: any) => ({ code: r.code, created_at: r.created_at }));
  }

  private subscribe(code: string): void {
    if (this.channel) this.channel.unsubscribe();
    if (this.broadcast) this.broadcast.unsubscribe();

    // Presence + moves via postgres changes
    this.channel = this.supabase
      .channel(`room:${code}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moves', filter: `room_code=eq.${code}` }, (payload: any) => {
        const row = payload.new;
        console.log('[supabase] move insert', row?.id, row?.from_sq, row?.to_sq);
        if (!row) return;
        // Skip our own echoes: match by from/to/fen
        if (this.lastSentMove && row.from_sq === this.lastSentMove.from && row.to_sq === this.lastSentMove.to && row.fen === this.lastSentMove.fen) {
          console.log('[supabase] skip own echo');
          return;
        }
        const move: NetMove = {
          from: row.from_sq,
          to: row.to_sq,
          promotion: row.promotion || undefined,
          fen: row.fen,
          whiteMs: row.white_ms,
          blackMs: row.black_ms,
        };
        this.moveCb?.(move);
        this.clockCb?.(row.white_ms, row.black_ms);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, (payload: any) => {
        const row = payload.new;
        if (row?.black_present) this.oppCb?.(true);
      })
      .subscribe((status: string) => {
        console.log('[supabase] moves channel:', status, code);
      });
    // Broadcast channel for draw/resign/clock
    this.broadcast = this.supabase
      .channel(`events:${code}`)
      .on('broadcast', { event: 'draw' }, () => this.drawCb?.())
      .on('broadcast', { event: 'resign' }, () => this.resignCb?.())
      .subscribe();
  }

  sendMove(m: NetMove): void {
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
      if (error) { console.error('sendMove failed', error.message, error.details, error.hint, error.code); }
    });
  }

  sendClock(_w: number, _b: number): void {
    // Clocks now travel with each move; nothing to do here.
  }

  onMove(cb: (m: NetMove) => void): void { this.moveCb = cb; }
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