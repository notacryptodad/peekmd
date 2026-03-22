/**
 * Shared types for peekmd.
 */

import type { Tier } from './tiers.js';

export interface Page {
  slug: string;
  html: string;
  markdown: string;
  createdAt: number;
  expiresAt: number; // 0 = never expires (permanent page)
  tier?: Tier; // defaults to 'free' for backwards compat
}

/**
 * Storage backend interface.
 * Implemented by MemoryStore (self-hosted) and KVStore (Cloudflare Workers).
 */
export interface PageStore {
  get(slug: string): Promise<Page | undefined>;
  set(page: Page): Promise<void>;
  burn(slug: string): Promise<boolean>;
}
