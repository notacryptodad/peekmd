import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from './memory-store.js';
import { KVStore } from './kv-store.js';
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
    // Manually put with already-expired TTL
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

  it('sets KV TTL correctly', async () => {
    const page = makePage({ expiresAt: Date.now() + 120_000 }); // 2 min from now
    await store.set(page);
    // Verify the stored value is valid JSON with correct data
    const raw = await mockKv.get(`page:${page.slug}`);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.slug).toBe('test123');
    expect(stored.html).toBe('<h1>Hello</h1>');
  });
});
