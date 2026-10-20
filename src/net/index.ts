import { LocalAdapter } from './adapter';
import { SupabaseAdapter } from './supabaseAdapter';
import type { NetAdapter } from './adapter';

let cached: NetAdapter | null = null;

export function createAdapter(): NetAdapter {
  if (cached) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  cached = (url && key) ? new SupabaseAdapter(url, key) : new LocalAdapter();
  return cached;
}

export function resetAdapter(): void { cached = null; }

export type { NetAdapter, NetMove, RoomSettings } from './adapter';
export { LocalAdapter } from './adapter';
export { SupabaseAdapter } from './supabaseAdapter';