/**
 * Shared types for peekmd.
 */

export interface Page {
  slug: string;
  html: string;
  markdown: string;
  createdAt: number;
  expiresAt: number;
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
