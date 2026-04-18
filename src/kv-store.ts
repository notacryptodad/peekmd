/**
 * Cloudflare KV page store.
 * Uses native KV TTL for auto-expiry — no sweep needed.
 * Permanent pages get a rolling 90-day TTL, refreshed on each read.
 */

import type { Page, PageStore } from './types.js';

export const PERMANENT_TTL_SEC = 90 * 24 * 60 * 60; // 90 days

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
    // expiresAt = 0 means permanent
    if (page.expiresAt > 0 && page.expiresAt <= Date.now()) {
      return undefined;
    }
    // Refresh rolling 90-day TTL for permanent pages
    if (page.expiresAt === 0) {
      this.kv.put(`page:${slug}`, raw, { expirationTtl: PERMANENT_TTL_SEC }).catch(() => {});
    }
    return page;
  }

  async set(page: Page): Promise<void> {
    const ttl =
      page.expiresAt === 0
        ? PERMANENT_TTL_SEC
        : Math.max(1, Math.ceil((page.expiresAt - Date.now()) / 1000));
    await this.kv.put(`page:${page.slug}`, JSON.stringify(page), { expirationTtl: ttl });
  }

  async burn(slug: string): Promise<boolean> {
    const existing = await this.kv.get(`page:${slug}`, { type: 'text' });
    if (!existing) return false;
    await this.kv.delete(`page:${slug}`);
    return true;
  }
}
