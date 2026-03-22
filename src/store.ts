/**
 * In-memory page store with TTL auto-expiry.
 */

export interface Page {
  slug: string;
  html: string;
  markdown: string;
  createdAt: number;
  expiresAt: number;
}

const pages = new Map<string, Page>();

// Cleanup interval: sweep expired pages every 30s
const SWEEP_INTERVAL_MS = 30_000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function sweep(): void {
  const now = Date.now();
  for (const [slug, page] of pages) {
    if (page.expiresAt <= now) {
      pages.delete(slug);
    }
  }
}

export function startSweep(): void {
  if (!sweepTimer) {
    sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
    sweepTimer.unref(); // don't keep process alive
  }
}

export function stopSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

export function set(page: Page): void {
  pages.set(page.slug, page);
}

export function get(slug: string): Page | undefined {
  const page = pages.get(slug);
  if (!page) return undefined;
  if (page.expiresAt <= Date.now()) {
    pages.delete(slug);
    return undefined;
  }
  return page;
}

export function burn(slug: string): boolean {
  return pages.delete(slug);
}

export function size(): number {
  return pages.size;
}

export function clear(): void {
  pages.clear();
}
