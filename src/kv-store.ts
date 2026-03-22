/**
 * Cloudflare KV page store.
 * Uses native KV TTL for auto-expiry — no sweep needed.
 */

import type { Page, PageStore } from './types.js';

export interface KVNamespace {
  get(key: string, options?: { type?: string }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export class KVStore implements PageStore {
  constructor(private kv: KVNamespace) {}

  async get(slug: string): Promise<Page | undefined> {
    const raw = await this.kv.get(`page:${slug}`, { type: 'text' });
    if (!raw) return undefined;
    const page: Page = JSON.parse(raw);
    // Double-check expiry (KV TTL is eventually consistent)
    if (page.expiresAt <= Date.now()) {
      return undefined;
    }
    return page;
  }

  async set(page: Page): Promise<void> {
    const ttlSec = Math.max(1, Math.ceil((page.expiresAt - Date.now()) / 1000));
    await this.kv.put(`page:${page.slug}`, JSON.stringify(page), {
      expirationTtl: ttlSec,
    });
  }

  async burn(slug: string): Promise<boolean> {
    const existing = await this.kv.get(`page:${slug}`, { type: 'text' });
    if (!existing) return false;
    await this.kv.delete(`page:${slug}`);
    return true;
  }
}
