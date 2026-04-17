import { describe, it, expect } from 'vitest';
import { KVApiKeyStore } from './stripe.js';
import type { KVApiKeyRecord } from './stripe.js';

/** Simple in-memory KV mock matching Cloudflare KV interface. */
function createMockKV() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, _options?: { type?: string }): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
  };
}

describe('KVApiKeyStore', () => {
  it('add() persists a key in KV with apikey: prefix', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    await store.add('sk_test_abc', 'cus_123', 'pro');

    const raw = kv.store.get('apikey:sk_test_abc');
    expect(raw).toBeDefined();
    const record: KVApiKeyRecord = JSON.parse(raw!);
    expect(record.stripeCustomerId).toBe('cus_123');
    expect(record.plan).toBe('pro');
    expect(record.createdAt).toBeDefined();
  });

  it('validate() returns ApiKeyRecord for existing keys', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    await store.add('sk_test_abc', 'cus_123', 'basic');

    const result = await store.validate('sk_test_abc');
    expect(result).toEqual({ key: 'sk_test_abc', stripeCustomerId: 'cus_123' });
  });

  it('validate() returns undefined for non-existent keys', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    const result = await store.validate('sk_nonexistent');
    expect(result).toBeUndefined();
  });

  it('validate() caches plan so getPlan() works', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    await store.add('sk_test_abc', 'cus_123', 'pro');
    await store.validate('sk_test_abc');

    const plan = await store.getPlan('cus_123');
    expect(plan).toBe('pro');
  });

  it('getPlan() returns undefined when key was never validated', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    const plan = await store.getPlan('cus_unknown');
    expect(plan).toBeUndefined();
  });

  it('setPlan() updates the in-memory cache', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    await store.setPlan('cus_123', 'basic');
    expect(await store.getPlan('cus_123')).toBe('basic');

    await store.setPlan('cus_123', 'pro');
    expect(await store.getPlan('cus_123')).toBe('pro');
  });

  it('getRecordByKey() returns full record', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    await store.add('sk_test_abc', 'cus_123', 'pro');

    const record = await store.getRecordByKey('sk_test_abc');
    expect(record).toBeDefined();
    expect(record!.stripeCustomerId).toBe('cus_123');
    expect(record!.plan).toBe('pro');
  });

  it('updateRecord() merges updates into existing record', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    await store.add('sk_test_abc', 'cus_123');
    await store.updateRecord('sk_test_abc', { email: 'user@test.com', plan: 'basic' });

    const record = await store.getRecordByKey('sk_test_abc');
    expect(record!.email).toBe('user@test.com');
    expect(record!.plan).toBe('basic');
    expect(record!.stripeCustomerId).toBe('cus_123');
  });

  it('add() without plan stores record without plan field', async () => {
    const kv = createMockKV();
    const store = new KVApiKeyStore(kv);

    await store.add('sk_test_abc', 'cus_123');

    const record = await store.getRecordByKey('sk_test_abc');
    expect(record!.plan).toBeUndefined();
  });
});
