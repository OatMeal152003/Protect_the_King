import { LocalAdapter } from './adapter';
import { SupabaseAdapter } from './supabaseAdapter';
import type { NetAdapter } from './adapter';

export function createAdapter(): NetAdapter {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return new SupabaseAdapter(url, key);
  return new LocalAdapter();
}

export type { NetAdapter, NetMove } from './adapter';
export { LocalAdapter } from './adapter';
export { SupabaseAdapter } from './supabaseAdapter';