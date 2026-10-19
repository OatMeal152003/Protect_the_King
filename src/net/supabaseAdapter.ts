import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { NetAdapter, NetMove } from './adapter';

export class SupabaseAdapter implements NetAdapter {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private broadcast: RealtimeChannel | null = null;
  private code = '';
  private lastMoveId = 0;

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
        console.log('[supabase] move insert', row?.id, row?.from_sq, row?.to_sq, 'lastMoveId=', this.lastMoveId);
        if (!row || row.id <= this.lastMoveId) { console.log('[supabase] skip'); return; }
        this.lastMoveId = row.id;
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
    this.supabase.from('moves').insert({
      room_code: this.code,
      from_sq: m.from,
      to_sq: m.to,
      promotion: m.promotion || null,
      fen: m.fen,
      white_ms: m.whiteMs ?? 0,
      black_ms: m.blackMs ?? 0,
    }).then(({ data, error }) => {
      if (error) { console.error('sendMove failed', error); return; }
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row?.id) this.lastMoveId = row.id;
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