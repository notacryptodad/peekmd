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

export interface ChallengeMeta {
  keeperCount: number;
  viewCount: number;
  extendSec: number;
  createdAt: number;
}

const CHALLENGE_IP_TTL = 600; // 10-minute cooldown per IP

export class KVStore implements PageStore {
  constructor(private kv: KVNamespace) {}

  async get(slug: string): Promise<Page | undefined> {
    const raw = await this.kv.get(`page:${slug}`, { type: 'text' });
    if (!raw) return undefined;
    const page: Page = JSON.parse(raw);
    if (page.expiresAt > 0 && page.expiresAt <= Date.now()) {
      return undefined;
    }
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

  async getChallenge(slug: string): Promise<ChallengeMeta | undefined> {
    const raw = await this.kv.get(`challenge:${slug}`, { type: 'text' });
    return raw ? JSON.parse(raw) : undefined;
  }

  async setChallenge(slug: string, meta: ChallengeMeta): Promise<void> {
    await this.kv.put(`challenge:${slug}`, JSON.stringify(meta));
  }

  async addChallengeToIndex(slug: string): Promise<void> {
    const raw = await this.kv.get('challenge-index', { type: 'text' });
    const slugs: string[] = raw ? JSON.parse(raw) : [];
    if (!slugs.includes(slug)) {
      slugs.push(slug);
      await this.kv.put('challenge-index', JSON.stringify(slugs));
    }
  }

  async listChallenges(): Promise<{ slug: string; meta: ChallengeMeta; expiresAt: number }[]> {
    const raw = await this.kv.get('challenge-index', { type: 'text' });
    const slugs: string[] = raw ? JSON.parse(raw) : [];
    const results: { slug: string; meta: ChallengeMeta; expiresAt: number }[] = [];
    const alive: string[] = [];
    for (const slug of slugs) {
      const [meta, page] = await Promise.all([this.getChallenge(slug), this.get(slug)]);
      if (meta && page) {
        results.push({ slug, meta, expiresAt: page.expiresAt });
        alive.push(slug);
      }
    }
    // Prune dead entries from index
    if (alive.length !== slugs.length) {
      await this.kv.put('challenge-index', JSON.stringify(alive));
    }
    return results.sort((a, b) => b.meta.keeperCount - a.meta.keeperCount);
  }

  async challengeVisit(slug: string, ip: string): Promise<{ extended: boolean; meta: ChallengeMeta }> {
    const meta = await this.getChallenge(slug);
    if (!meta) return { extended: false, meta: { keeperCount: 0, viewCount: 0, extendSec: 0, createdAt: 0 } };

    meta.viewCount++;
    const ipKey = `challenge-ip:${slug}:${ip}`;
    const seen = await this.kv.get(ipKey, { type: 'text' });
    let extended = false;

    if (!seen) {
      meta.keeperCount++;
      extended = true;
      // Extend page TTL
      const page = await this.get(slug);
      if (page && page.expiresAt > 0) {
        page.expiresAt = Math.max(page.expiresAt, Date.now()) + meta.extendSec * 1000;
        await this.set(page);
      }
      await this.kv.put(ipKey, '1', { expirationTtl: CHALLENGE_IP_TTL });
    }

    await this.setChallenge(slug, meta);
    return { extended, meta };
  }
}
