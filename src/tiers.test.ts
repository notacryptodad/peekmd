import { describe, it, expect } from 'vitest';
import { detectTier, validateTierTtl, stripePriceCents, TIER_CONFIGS } from './tiers.js';

describe('detectTier', () => {
  it('defaults to free when no headers', () => {
    expect(detectTier()).toEqual({ tier: 'free' });
    expect(detectTier(null, null)).toEqual({ tier: 'free' });
    expect(detectTier(undefined, undefined)).toEqual({ tier: 'free' });
  });

  it('detects stripe from Bearer sk_ token', () => {
    const result = detectTier('Bearer sk_test_abc123');
    expect(result.tier).toBe('stripe');
    expect(result.apiKey).toBe('sk_test_abc123');
  });

  it('detects stripe case-insensitively', () => {
    const result = detectTier('bearer sk_live_xyz');
    expect(result.tier).toBe('stripe');
    expect(result.apiKey).toBe('sk_live_xyz');
  });

  it('detects x402 from X-PAYMENT header', () => {
    const result = detectTier(null, 'base64encodedpayment');
    expect(result.tier).toBe('x402');
    expect(result.paymentHeader).toBe('base64encodedpayment');
  });

  it('prefers stripe over x402 if both present', () => {
    const result = detectTier('Bearer sk_test_abc', 'payment');
    expect(result.tier).toBe('stripe');
  });

  it('ignores non-sk_ bearer tokens', () => {
    const result = detectTier('Bearer some_other_token');
    expect(result.tier).toBe('free');
  });
});

describe('validateTierTtl', () => {
  it('uses tier default when TTL not specified', () => {
    expect(validateTierTtl(undefined, 'free')).toEqual({ ok: true, ttlSec: 300 });
    expect(validateTierTtl(undefined, 'stripe')).toEqual({ ok: true, ttlSec: 86400 });
    expect(validateTierTtl(undefined, 'x402')).toEqual({ ok: true, ttlSec: 86400 });
  });

  it('accepts valid TTL within free tier', () => {
    expect(validateTierTtl(60, 'free')).toEqual({ ok: true, ttlSec: 60 });
    expect(validateTierTtl(300, 'free')).toEqual({ ok: true, ttlSec: 300 });
  });

  it('requires payment for TTL exceeding free tier', () => {
    expect(validateTierTtl(301, 'free')).toEqual({ ok: false, reason: 'payment_required' });
    expect(validateTierTtl(3600, 'free')).toEqual({ ok: false, reason: 'payment_required' });
  });

  it('allows extended TTL for paid tiers', () => {
    expect(validateTierTtl(3600, 'stripe')).toEqual({ ok: true, ttlSec: 3600 });
    expect(validateTierTtl(86400, 'x402')).toEqual({ ok: true, ttlSec: 86400 });
    expect(validateTierTtl(604800, 'stripe')).toEqual({ ok: true, ttlSec: 604800 });
  });

  it('allows permanent (ttl=0) for paid tiers', () => {
    expect(validateTierTtl(0, 'stripe')).toEqual({ ok: true, ttlSec: 0 });
    expect(validateTierTtl(0, 'x402')).toEqual({ ok: true, ttlSec: 0 });
  });

  it('requires payment for permanent on free tier', () => {
    expect(validateTierTtl(0, 'free')).toEqual({ ok: false, reason: 'payment_required' });
  });

  it('rejects invalid TTL values', () => {
    expect(validateTierTtl(NaN, 'free')).toEqual({ ok: false, reason: 'invalid' });
    expect(validateTierTtl(Infinity, 'free')).toEqual({ ok: false, reason: 'invalid' });
    expect(validateTierTtl(-1, 'free')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('floors fractional TTL', () => {
    expect(validateTierTtl(60.7, 'free')).toEqual({ ok: true, ttlSec: 60 });
  });
});

describe('stripePriceCents', () => {
  it('returns 0.1 for <= 1 hour', () => {
    expect(stripePriceCents(60)).toBe(0.1);
    expect(stripePriceCents(3600)).toBe(0.1);
  });

  it('returns 0.5 for <= 24 hours', () => {
    expect(stripePriceCents(3601)).toBe(0.5);
    expect(stripePriceCents(86400)).toBe(0.5);
  });

  it('returns 1.0 for > 24 hours or permanent', () => {
    expect(stripePriceCents(86401)).toBe(1.0);
    expect(stripePriceCents(0)).toBe(1.0);
  });
});

describe('TIER_CONFIGS', () => {
  it('free tier has 5-min cap and ad banner', () => {
    expect(TIER_CONFIGS.free.maxTtlSec).toBe(300);
    expect(TIER_CONFIGS.free.showAdBanner).toBe(true);
  });

  it('paid tiers have unlimited TTL and no ad banner', () => {
    expect(TIER_CONFIGS.stripe.maxTtlSec).toBe(0);
    expect(TIER_CONFIGS.stripe.showAdBanner).toBe(false);
    expect(TIER_CONFIGS.x402.maxTtlSec).toBe(0);
    expect(TIER_CONFIGS.x402.showAdBanner).toBe(false);
  });
});
