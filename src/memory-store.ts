/**
 * In-memory page store with TTL auto-expiry.
 * Used for self-hosted deployment.
 */

import type { Page, PageStore } from './types.js';

export class MemoryStore implements PageStore {
  private pages = new Map<string, Page>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  async get(slug: string): Promise<Page | undefined> {
    const page = this.pages.get(slug);
    if (!page) return undefined;
    if (page.expiresAt <= Date.now()) {
      this.pages.delete(slug);
      return undefined;
    }
    return page;
  }

  async set(page: Page): Promise<void> {
    this.pages.set(page.slug, page);
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
    for (const [slug, page] of this.pages) {
      if (page.expiresAt <= now) {
        this.pages.delete(slug);
      }
    }
  }
}
