import { LocalAdapter } from './adapter';
import type { NetAdapter } from './adapter';

export function createAdapter(): NetAdapter {
  // Supabase path would go here if VITE_SUPABASE_URL is set.
  // Default to local adapter for dev/offline.
  return new LocalAdapter();
}

export type { NetAdapter, NetMove } from './adapter';
export { LocalAdapter } from './adapter';