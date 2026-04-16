import { describe, it, expect } from 'vitest';
import { MemoryRateLimiter, FREE_DAILY_LIMIT, rateLimitResponse } from './rate-limit.js';

describe('MemoryRateLimiter', () => {
  it('allows requests within limit', async () => {
    const limiter = new MemoryRateLimiter(3);
    const r1 = await limiter.consume('1.2.3.4');
    expect(r1.allowed).toBe(true);
    expect(r1.used).toBe(1);
    expect(r1.remaining).toBe(2);
    expect(r1.limit).toBe(3);
  });

  it('blocks requests exceeding limit', async () => {
    const limiter = new MemoryRateLimiter(2);
    await limiter.consume('1.2.3.4');
    await limiter.consume('1.2.3.4');
    const r3 = await limiter.consume('1.2.3.4');
    expect(r3.allowed).toBe(false);
    expect(r3.used).toBe(3);
    expect(r3.remaining).toBe(0);
  });

  it('tracks IPs independently', async () => {
    const limiter = new MemoryRateLimiter(1);
    const r1 = await limiter.consume('1.1.1.1');
    expect(r1.allowed).toBe(true);
    const r2 = await limiter.consume('2.2.2.2');
    expect(r2.allowed).toBe(true);
    const r3 = await limiter.consume('1.1.1.1');
    expect(r3.allowed).toBe(false);
  });

  it('uses FREE_DAILY_LIMIT as default', async () => {
    const limiter = new MemoryRateLimiter();
    const r = await limiter.consume('1.2.3.4');
    expect(r.limit).toBe(FREE_DAILY_LIMIT);
    expect(r.limit).toBe(20);
  });

  it('includes resetDate as UTC date string', async () => {
    const limiter = new MemoryRateLimiter();
    const r = await limiter.consume('1.2.3.4');
    expect(r.resetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('rateLimitResponse', () => {
  it('returns structured 429 body with upgrade info', () => {
    const result = {
      allowed: false,
      remaining: 0,
      used: 21,
      limit: 20,
      resetDate: '2026-04-16',
    };
    const body = rateLimitResponse(result, 'https://peekmd.dev');
    expect(body.error).toBe('rate_limit_exceeded');
    expect(body.message).toContain('20 pages per day');
    expect(body.message).toContain('21');
    expect(body.used).toBe(21);
    expect(body.limit).toBe(20);
    expect(body.upgrade.stripe.checkoutUrl).toBe('https://peekmd.dev/api/stripe/checkout');
  });
});
