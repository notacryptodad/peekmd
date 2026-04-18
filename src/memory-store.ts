/**
 * In-memory page store with TTL auto-expiry.
 * Used for self-hosted deployment.
 * Permanent pages are evicted after 90 days of inactivity.
 */

import type { Page, PageStore } from './types.js';
import { PERMANENT_TTL_SEC } from './kv-store.js';

const PERMANENT_TTL_MS = PERMANENT_TTL_SEC * 1000;

interface StoredPage {
  page: Page;
  lastAccessedAt: number;
}

export class MemoryStore implements PageStore {
  private pages = new Map<string, StoredPage>();
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
