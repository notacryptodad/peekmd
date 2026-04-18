/**
 * In-memory page store with TTL auto-expiry.
 * Used for self-hosted deployment.
 * Permanent pages are evicted after 90 days of inactivity.
 */

import type { Page, PageStore } from './types.js';
import { PERMANENT_TTL_SEC, type ChallengeMeta } from './kv-store.js';

const PERMANENT_TTL_MS = PERMANENT_TTL_SEC * 1000;
const CHALLENGE_IP_TTL_MS = 600_000; // 10 minutes

interface StoredPage {
  page: Page;
  lastAccessedAt: number;
}

export class MemoryStore implements PageStore {
  private pages = new Map<string, StoredPage>();
  private challenges = new Map<string, ChallengeMeta>();
  private challengeIps = new Map<string, number>(); // key -> expiresAt timestamp
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  async get(slug: string): Promise<Page | undefined> {
    const entry = this.pages.get(slug);
    if (!entry) return undefined;
    const { page } = entry;
    // expiresAt = 0 means permanent (never expires, but evicts after inactivity)
    if (page.expiresAt > 0 && page.expiresAt <= Date.now()) {
      this.pages.delete(slug);
      return undefined;
    }
    // Refresh access time for permanent pages
    if (page.expiresAt === 0) {
      entry.lastAccessedAt = Date.now();
    }
    return page;
  }

  async set(page: Page): Promise<void> {
    this.pages.set(page.slug, { page, lastAccessedAt: Date.now() });
  }

  async burn(slug: string): Promise<boolean> {
    return this.pages.delete(slug);
  }

  size(): number {
    return this.pages.size;
  }

  clear(): void {
    this.pages.clear();
    this.challenges.clear();
    this.challengeIps.clear();
  }

  async getChallenge(slug: string): Promise<ChallengeMeta | undefined> {
    return this.challenges.get(slug);
  }

  async setChallenge(slug: string, meta: ChallengeMeta): Promise<void> {
    this.challenges.set(slug, meta);
  }

  async listChallenges(): Promise<{ slug: string; meta: ChallengeMeta; expiresAt: number }[]> {
    const results: { slug: string; meta: ChallengeMeta; expiresAt: number }[] = [];
    for (const [slug, meta] of this.challenges) {
      const entry = this.pages.get(slug);
      if (entry) {
        results.push({ slug, meta, expiresAt: entry.page.expiresAt });
      }
    }
    return results.sort((a, b) => b.meta.keeperCount - a.meta.keeperCount);
  }

  async challengeVisit(slug: string, ip: string): Promise<{ extended: boolean; meta: ChallengeMeta }> {
    const meta = this.challenges.get(slug);
    if (!meta) return { extended: false, meta: { keeperCount: 0, viewCount: 0, extendSec: 0, createdAt: 0 } };

    meta.viewCount++;
    const ipKey = `${slug}:${ip}`;
    const ipExpiry = this.challengeIps.get(ipKey);
    let extended = false;

    if (!ipExpiry || ipExpiry <= Date.now()) {
      meta.keeperCount++;
      extended = true;
      const entry = this.pages.get(slug);
      if (entry && entry.page.expiresAt > 0) {
        entry.page.expiresAt = Math.max(entry.page.expiresAt, Date.now()) + meta.extendSec * 1000;
      }
      this.challengeIps.set(ipKey, Date.now() + CHALLENGE_IP_TTL_MS);
    }

    return { extended, meta };
  }

  startSweep(intervalMs = 30_000): void {
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.sweep(), intervalMs);
      this.sweepTimer.unref();
    }
  }

  stopSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [slug, entry] of this.pages) {
      const { page } = entry;
      if (page.expiresAt > 0 && page.expiresAt <= now) {
        this.pages.delete(slug);
      } else if (page.expiresAt === 0 && now - entry.lastAccessedAt >= PERMANENT_TTL_MS) {
        this.pages.delete(slug);
      }
    }
  }
}
