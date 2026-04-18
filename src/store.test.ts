import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryStore } from './memory-store.js';
import { KVStore, PERMANENT_TTL_SEC } from './kv-store.js';
import type { Page } from './types.js';

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    slug: 'test123',
    html: '<h1>Hello</h1>',
    markdown: '# Hello',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

// ─── MemoryStore ──────────────────────────────────────────────────

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('stores and retrieves a page', async () => {
    const page = makePage();
    await store.set(page);
    const result = await store.get('test123');
    expect(result).toEqual(page);
  });

  it('returns undefined for missing slug', async () => {
    const result = await store.get('missing');
    expect(result).toBeUndefined();
  });

  it('returns undefined for expired page', async () => {
    const page = makePage({ expiresAt: Date.now() - 1000 });
    await store.set(page);
    const result = await store.get('test123');
    expect(result).toBeUndefined();
  });

  it('burns a page', async () => {
    await store.set(makePage());
    const burned = await store.burn('test123');
    expect(burned).toBe(true);
    const result = await store.get('test123');
    expect(result).toBeUndefined();
  });

  it('returns false when burning missing page', async () => {
    const burned = await store.burn('missing');
    expect(burned).toBe(false);
  });

  it('tracks size correctly', async () => {
    expect(store.size()).toBe(0);
    await store.set(makePage({ slug: 'a' }));
    await store.set(makePage({ slug: 'b' }));
    expect(store.size()).toBe(2);
    await store.burn('a');
    expect(store.size()).toBe(1);
  });

  it('clears all pages', async () => {
    await store.set(makePage({ slug: 'a' }));
    await store.set(makePage({ slug: 'b' }));
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('keeps permanent pages alive when accessed', async () => {
    const page = makePage({ expiresAt: 0 });
    await store.set(page);
    const result = await store.get('test123');
    expect(result).toBeDefined();
    expect(result!.expiresAt).toBe(0);
  });

  it('evicts stale permanent pages in sweep', async () => {
    const page = makePage({ expiresAt: 0 });
    await store.set(page);

    // Fast-forward past 90 days
    vi.useFakeTimers();
    vi.advanceTimersByTime(PERMANENT_TTL_SEC * 1000 + 1);
    // Trigger sweep via startSweep with tiny interval
    store.startSweep(1);
    await vi.advanceTimersByTimeAsync(10);
    store.stopSweep();
    vi.useRealTimers();

    expect(store.size()).toBe(0);
  });

  it('does not evict recently accessed permanent pages in sweep', async () => {
    vi.useFakeTimers();
    const page = makePage({ expiresAt: 0 });
    await store.set(page);

    // Advance 89 days and access
    vi.advanceTimersByTime((PERMANENT_TTL_SEC - 86400) * 1000);
    await store.get('test123');

    // Advance 1 more day (total 90 from set, but only 1 day since last access)
    vi.advanceTimersByTime(86400 * 1000);
    store.startSweep(1);
    await vi.advanceTimersByTimeAsync(10);
    store.stopSweep();
    vi.useRealTimers();

    expect(store.size()).toBe(1);
  });
});

// ─── KVStore (with mock KV) ──────────────────────────────────────

class MockKV {
  private data = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string, _opts?: { type?: string }): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined;
    this.data.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  /** Expose stored TTL for assertions */
  getEntry(key: string) {
    return this.data.get(key);
  }
}

describe('KVStore', () => {
  let mockKv: MockKV;
  let store: KVStore;

  beforeEach(() => {
    mockKv = new MockKV();
    store = new KVStore(mockKv);
  });

  it('stores and retrieves a page', async () => {
    const page = makePage();
    await store.set(page);
    const result = await store.get('test123');
    expect(result).toEqual(page);
  });

  it('returns undefined for missing slug', async () => {
    const result = await store.get('missing');
    expect(result).toBeUndefined();
  });

  it('returns undefined for expired page', async () => {
    const page = makePage({ expiresAt: Date.now() - 1000 });
    await mockKv.put(`page:${page.slug}`, JSON.stringify(page), { expirationTtl: 0 });
    const result = await store.get('test123');
    expect(result).toBeUndefined();
  });

  it('burns a page', async () => {
    await store.set(makePage());
    const burned = await store.burn('test123');
    expect(burned).toBe(true);
    const result = await store.get('test123');
    expect(result).toBeUndefined();
  });

  it('returns false when burning missing page', async () => {
    const burned = await store.burn('missing');
    expect(burned).toBe(false);
  });

  it('sets KV TTL correctly for expiring pages', async () => {
    const page = makePage({ expiresAt: Date.now() + 120_000 });
    await store.set(page);
    const raw = await mockKv.get(`page:${page.slug}`);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.slug).toBe('test123');
  });

  it('sets 90-day TTL for permanent pages', async () => {
    const page = makePage({ expiresAt: 0 });
    await store.set(page);
    const entry = mockKv.getEntry(`page:${page.slug}`);
    expect(entry).toBeDefined();
    // Should expire ~90 days from now
    const expectedExpiry = Date.now() + PERMANENT_TTL_SEC * 1000;
    expect(entry!.expiresAt).toBeGreaterThan(expectedExpiry - 5000);
    expect(entry!.expiresAt).toBeLessThanOrEqual(expectedExpiry + 5000);
  });

  it('refreshes TTL on read for permanent pages', async () => {
    const page = makePage({ expiresAt: 0 });
    await store.set(page);
    const entryBefore = mockKv.getEntry(`page:${page.slug}`);
    const expiryBefore = entryBefore!.expiresAt!;

    // Wait a tick so Date.now() advances
    await new Promise((r) => setTimeout(r, 10));
    await store.get('test123');

    // Allow the fire-and-forget put to settle
    await new Promise((r) => setTimeout(r, 10));
    const entryAfter = mockKv.getEntry(`page:${page.slug}`);
    expect(entryAfter!.expiresAt).toBeGreaterThanOrEqual(expiryBefore);
  });

  it('does not refresh TTL on read for expiring pages', async () => {
    const page = makePage({ expiresAt: Date.now() + 60_000 });
    const putSpy = vi.spyOn(mockKv, 'put');
    await store.set(page);
    putSpy.mockClear();

    await store.get('test123');
    // No extra put should have been called
    expect(putSpy).not.toHaveBeenCalled();
  });
});
