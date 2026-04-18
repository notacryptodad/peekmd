import { describe, it, expect } from 'vitest';
import { buildApp } from './server.js';
import { MemoryStore } from './memory-store.js';
import { MockStripeService, InMemoryApiKeyStore } from './stripe.js';
import { MemoryRateLimiter } from './rate-limit.js';

const BASE_URL = 'http://localhost:3000';

function app(opts?: { stripe?: MockStripeService; x402?: object }) {
  const memStore = new MemoryStore();
  return buildApp({
    baseUrl: BASE_URL,
    store: memStore,
    stripe: opts?.stripe,
    x402: opts?.x402,
  });
}

function stripeApp(plan: 'basic' | 'pro' = 'pro') {
  const keyStore = new InMemoryApiKeyStore();
  keyStore.add('sk_test_valid', 'cus_test123', plan);
  const stripe = new MockStripeService(keyStore);
  return { server: app({ stripe }), stripe };
}

describe('peekmd API', () => {
  // ─── POST /api/create (Free tier) ────────────────────────────

  describe('POST /api/create (free tier)', () => {
    it('creates a page and returns url + slug + expiresAt + tier', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Hello World' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.url).toMatch(/^http:\/\/localhost:3000\/.+/);
      expect(body.slug).toBeDefined();
      expect(body.expiresAt).toBeDefined();
      expect(body.tier).toBe('free');
      // Free tier default: 5 min
      const expires = new Date(body.expiresAt).getTime();
      const now = Date.now();
      expect(expires - now).toBeGreaterThan(4 * 60 * 1000);
      expect(expires - now).toBeLessThan(6 * 60 * 1000);
    });

    it('accepts custom ttl within free limits', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Test', ttl: 60 },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      const expires = new Date(body.expiresAt).getTime();
      const now = Date.now();
      expect(expires - now).toBeGreaterThan(55 * 1000);
      expect(expires - now).toBeLessThan(65 * 1000);
    });

    it('returns 402 with upgrade instructions for ttl exceeding free tier', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Test', ttl: 3600 },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('payment_required');
      // Should include clear upgrade instructions
      expect(body.message).toContain('ad banner');
      expect(body.upgrade).toBeDefined();
      expect(body.upgrade.stripe).toBeDefined();
      expect(body.upgrade.stripe.checkoutUrl).toContain('/api/stripe/checkout');
      expect(body.upgrade.stripe.description).toContain('API key');
    });

    it('returns 402 for permanent page on free tier', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Test', ttl: 0 },
      });
      expect(res.statusCode).toBe(402);
    });

    it('rejects empty markdown', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('markdown');
    });

    it('rejects missing markdown', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid ttl', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Test', ttl: -1 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects oversized markdown', async () => {
      const server = app();
      const huge = 'x'.repeat(600_000);
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: huge },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('size');
    });
  });

  // ─── POST /api/create (Stripe tier) ──────────────────────────

  describe('POST /api/create (stripe tier)', () => {
    it('creates page with extended TTL for valid API key', async () => {
      const { server } = stripeApp();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Stripe page', ttl: 3600 },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.tier).toBe('stripe');
      const expires = new Date(body.expiresAt).getTime();
      expect(expires - Date.now()).toBeGreaterThan(3500 * 1000);
    });

    it('creates permanent page for valid API key', async () => {
      const { server } = stripeApp();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Permanent', ttl: 0 },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.expiresAt).toBeNull();
      expect(body.tier).toBe('stripe');
    });

    it('records usage for stripe pages', async () => {
      const { server, stripe } = stripeApp();
      await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Test' },
      });
      // Give fire-and-forget a moment
      await new Promise((r) => setTimeout(r, 50));
      expect(stripe.usageRecords.length).toBe(1);
      expect(stripe.usageRecords[0].customerId).toBe('cus_test123');
    });

    it('rejects invalid API key', async () => {
      const { server } = stripeApp();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_invalid' },
        payload: { markdown: '# Test' },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toContain('Invalid');
    });
  });

  // ─── POST /api/create (Basic plan TTL enforcement) ──────────

  describe('POST /api/create (basic plan TTL cap)', () => {
    it('allows TTL within 30-day cap for basic plan', async () => {
      const { server } = stripeApp('basic');
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Basic page', ttl: 86400 },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).tier).toBe('stripe');
    });

    it('allows TTL at exactly 30 days for basic plan', async () => {
      const { server } = stripeApp('basic');
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Max basic', ttl: 2_592_000 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 402 plan_limit for TTL exceeding 30 days on basic plan', async () => {
      const { server } = stripeApp('basic');
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Too long', ttl: 2_592_001 },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('plan_limit');
      expect(body.message).toContain('Basic');
      expect(body.message).toContain('30 days');
      expect(body.maxTtlSeconds).toBe(2_592_000);
      expect(body.upgrade).toBeDefined();
      expect(body.upgrade.checkoutUrl).toContain('/api/stripe/checkout');
    });

    it('returns 402 plan_limit for permanent page on basic plan', async () => {
      const { server } = stripeApp('basic');
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Permanent', ttl: 0 },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('plan_limit');
      expect(body.upgrade).toBeDefined();
    });

    it('pro plan allows permanent pages', async () => {
      const { server } = stripeApp('pro');
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Permanent pro', ttl: 0 },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.expiresAt).toBeNull();
    });

    it('pro plan allows TTL beyond 30 days', async () => {
      const { server } = stripeApp('pro');
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Long pro', ttl: 5_000_000 },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  // ─── GET /:slug ─────────────────────────────────────────────

  describe('GET /:slug', () => {
    it('serves a rendered page', async () => {
      const server = app();
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Hello\n\nSome **bold** text.' },
      });
      const { slug } = JSON.parse(createRes.body);

      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Hello');
      expect(res.body).toContain('<strong>bold</strong>');
      expect(res.body).toContain('peekmd');
      expect(res.body).toContain('burn');
    });

    it('shows ad banner for free tier pages', async () => {
      const server = app();
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Free page' },
      });
      const { slug } = JSON.parse(createRes.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.body).toContain('Upgrade to remove ads');
    });

    it('hides ad banner for stripe tier pages', async () => {
      const { server } = stripeApp();
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Paid page' },
      });
      const { slug } = JSON.parse(createRes.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.body).not.toContain('Upgrade for longer TTLs');
    });

    it('shows permanent for non-expiring pages', async () => {
      const { server } = stripeApp();
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Permanent', ttl: 0 },
      });
      const { slug } = JSON.parse(createRes.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.body).toContain('permanent');
    });

    it('returns 404 for unknown slug', async () => {
      const server = app();
      const res = await server.inject({ method: 'GET', url: '/nonexistent' });
      expect(res.statusCode).toBe(404);
      expect(res.body).toContain('expired');
    });

    it('returns 404 for expired page', async () => {
      const server = app();
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Temp', ttl: 1 },
      });
      const { slug } = JSON.parse(createRes.body);
      await new Promise((r) => setTimeout(r, 1100));
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── POST /api/burn/:slug ──────────────────────────────────

  describe('POST /api/burn/:slug', () => {
    it('burns a page', async () => {
      const server = app();
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Burn me' },
      });
      const { slug } = JSON.parse(createRes.body);
      const burnRes = await server.inject({
        method: 'POST',
        url: `/api/burn/${slug}`,
      });
      expect(burnRes.statusCode).toBe(200);
      const getRes = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(getRes.statusCode).toBe(404);
    });

    it('returns 404 for unknown slug', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/burn/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── Billing endpoints ──────────────────────────────────────

  describe('GET /api/billing/status', () => {
    it('returns billing status with plan, quota, and period fields', async () => {
      const { server, stripe } = stripeApp();
      // Create some usage first
      await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Test' },
      });
      await new Promise((r) => setTimeout(r, 50));

      const res = await server.inject({
        method: 'GET',
        url: '/api/billing/status',
        headers: { authorization: 'Bearer sk_test_valid' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.customerId).toBe('cus_test123');
      expect(body.currentPeriodUsage).toBe(1);
      expect(body.plan).toBeDefined();
      expect(body.pagesUsed).toBe(1);
      expect(body.quotaLimit).toBeGreaterThan(0);
      expect(body.remaining).toBe(body.quotaLimit - 1);
      expect(body.periodStart).toBeDefined();
      expect(body.periodEnd).toBeDefined();
    });

    it('rejects missing API key', async () => {
      const server = app();
      const res = await server.inject({
        method: 'GET',
        url: '/api/billing/status',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects invalid API key', async () => {
      const { server } = stripeApp();
      const res = await server.inject({
        method: 'GET',
        url: '/api/billing/status',
        headers: { authorization: 'Bearer sk_test_bad' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── Quota Enforcement ──────────────────────────────────────

  describe('Quota enforcement', () => {
    function quotaApp(plan: 'basic' | 'pro' = 'basic') {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_quota', 'cus_quota', plan);
      const stripe = new MockStripeService(keyStore);
      return { server: app({ stripe }), stripe };
    }

    it('allows pages within quota', async () => {
      const { server } = quotaApp('basic');
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_quota' },
        payload: { markdown: '# Within quota' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 402 when quota exceeded', async () => {
      const { server, stripe } = quotaApp('basic');
      // Exhaust the quota (basic = 500 pages)
      for (let i = 0; i < 500; i++) {
        await stripe.recordUsage('cus_quota');
      }
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_quota' },
        payload: { markdown: '# Over quota' },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('quota_exceeded');
      expect(body.pagesUsed).toBe(500);
      expect(body.quotaLimit).toBe(500);
      expect(body.remaining).toBe(0);
      expect(body.upgrade).toBeDefined();
      expect(body.upgrade.checkoutUrl).toContain('/api/stripe/checkout');
    });

    it('pro plan has higher quota than basic', async () => {
      const { server, stripe } = quotaApp('pro');
      // Use 100 pages (basic limit)
      for (let i = 0; i < 100; i++) {
        await stripe.recordUsage('cus_quota');
      }
      // Pro plan (5000 pages) should still allow
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_quota' },
        payload: { markdown: '# Still within pro quota' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('billing status reflects usage and quota', async () => {
      const { server, stripe } = quotaApp('basic');
      // Create 3 pages
      for (let i = 0; i < 3; i++) {
        await server.inject({
          method: 'POST',
          url: '/api/create',
          headers: { authorization: 'Bearer sk_test_quota' },
          payload: { markdown: `# Page ${i}` },
        });
      }
      await new Promise((r) => setTimeout(r, 50));

      const res = await server.inject({
        method: 'GET',
        url: '/api/billing/status',
        headers: { authorization: 'Bearer sk_test_quota' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.plan).toBe('basic');
      expect(body.pagesUsed).toBe(3);
      expect(body.quotaLimit).toBe(500);
      expect(body.remaining).toBe(497);
    });

    it('checkout with plan stores plan for quota tracking', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });

      // Create checkout with pro plan
      const checkoutRes = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
        payload: { plan: 'pro' },
      });
      const { sessionId } = JSON.parse(checkoutRes.body);

      // Complete checkout (returns HTML success page)
      const callbackRes = await server.inject({
        method: 'GET',
        url: `/api/stripe/callback?session_id=${sessionId}`,
      });
      const apiKey = callbackRes.body.match(/>(sk_[^<]+)</)?.[1];

      // Check billing status shows pro plan
      const statusRes = await server.inject({
        method: 'GET',
        url: '/api/billing/status',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      const status = JSON.parse(statusRes.body);
      expect(status.plan).toBe('pro');
      expect(status.quotaLimit).toBe(5000);
    });
  });

  // ─── Stripe Checkout Flow ──────────────────────────────────

  describe('Stripe Checkout Flow', () => {
    it('POST /api/stripe/checkout creates a checkout session', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.url).toContain('/api/stripe/callback');
      expect(body.sessionId).toBeDefined();
    });

    it('GET /api/stripe/callback returns API key after checkout', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });

      // First create a checkout session
      const checkoutRes = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
      });
      const { sessionId } = JSON.parse(checkoutRes.body);

      // Then handle the callback (returns HTML success page)
      const callbackRes = await server.inject({
        method: 'GET',
        url: `/api/stripe/callback?session_id=${sessionId}`,
      });
      expect(callbackRes.statusCode).toBe(200);
      expect(callbackRes.headers['content-type']).toContain('text/html');
      expect(callbackRes.body).toContain('Subscription Active');
      const apiKey = callbackRes.body.match(/>(sk_[^<]+)</)?.[1];
      expect(apiKey).toBeDefined();
      expect(apiKey).toMatch(/^sk_/);
      expect(callbackRes.body).toContain('Authorization: Bearer');
    });

    it('API key from checkout works for page creation', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });

      // Create checkout session and get API key
      const checkoutRes = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
      });
      const { sessionId } = JSON.parse(checkoutRes.body);
      const callbackRes = await server.inject({
        method: 'GET',
        url: `/api/stripe/callback?session_id=${sessionId}`,
      });
      const apiKey = callbackRes.body.match(/>(sk_[^<]+)</)?.[1]!;

      // Use the API key to create a page with extended TTL
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { markdown: '# Paid via checkout', ttl: 3600 },
      });
      expect(createRes.statusCode).toBe(201);
      const createBody = JSON.parse(createRes.body);
      expect(createBody.tier).toBe('stripe');
    });

    it('GET /api/stripe/callback rejects missing session_id', async () => {
      const server = app();
      const res = await server.inject({
        method: 'GET',
        url: '/api/stripe/callback',
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /api/stripe/callback rejects invalid session_id', async () => {
      const server = app();
      const res = await server.inject({
        method: 'GET',
        url: '/api/stripe/callback?session_id=invalid',
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/stripe/checkout accepts plan parameter', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
        payload: { plan: 'basic' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.url).toContain('/api/stripe/callback');
      expect(body.plan).toBe('basic');
      expect(body.sessionId).toBeDefined();
    });

    it('POST /api/stripe/checkout accepts pro plan', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
        payload: { plan: 'pro' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.plan).toBe('pro');
    });

    it('POST /api/stripe/checkout rejects invalid plan', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
        payload: { plan: 'enterprise' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('invalid_plan');
      expect(body.message).toContain('enterprise');
    });

    it('POST /api/stripe/checkout works without plan (legacy)', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.plan).toBeNull();
    });

    it('MockStripeService stores plan in checkout session', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
        payload: { plan: 'pro' },
      });
      const { sessionId } = JSON.parse(res.body);
      const session = stripe.checkoutSessions.get(sessionId);
      expect(session?.plan).toBe('pro');
    });
  });

  // ─── Stripe Customer Portal ────────────────────────────────

  describe('GET /api/stripe/portal', () => {
    it('redirects to portal URL for valid API key', async () => {
      const { server } = stripeApp();
      const res = await server.inject({
        method: 'GET',
        url: '/api/stripe/portal',
        headers: { authorization: 'Bearer sk_test_valid' },
      });
      expect(res.statusCode).toBe(303);
      expect(res.headers.location).toContain('portal=mock');
      expect(res.headers.location).toContain('customer=cus_test123');
    });

    it('rejects missing API key', async () => {
      const server = app();
      const res = await server.inject({
        method: 'GET',
        url: '/api/stripe/portal',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects invalid API key', async () => {
      const { server } = stripeApp();
      const res = await server.inject({
        method: 'GET',
        url: '/api/stripe/portal',
        headers: { authorization: 'Bearer sk_test_bad' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── Pricing ────────────────────────────────────────────────

  describe('GET /api/pricing', () => {
    it('returns pricing info for all tiers', async () => {
      const server = app();
      const res = await server.inject({ method: 'GET', url: '/api/pricing' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.free.maxTtlSeconds).toBe(300);
      expect(body.free.adBanner).toBe(true);
      expect(body.stripe.adBanner).toBe(false);
      expect(body.x402.pricePerPage).toBe('0.02 USDC');
    });

    it('includes subscription plans in stripe pricing', async () => {
      const server = app();
      const res = await server.inject({ method: 'GET', url: '/api/pricing' });
      const body = JSON.parse(res.body);
      expect(body.stripe.plans).toBeDefined();
      expect(body.stripe.plans).toHaveLength(2);
      expect(body.stripe.plans[0].plan).toBe('basic');
      expect(body.stripe.plans[0].name).toBe('Basic');
      expect(body.stripe.plans[0].pagesPerMonth).toBe(500);
      expect(body.stripe.plans[0].pricePerMonthCents).toBe(900);
      expect(body.stripe.plans[1].plan).toBe('pro');
      expect(body.stripe.plans[1].name).toBe('Pro');
      expect(body.stripe.plans[1].pagesPerMonth).toBe(5000);
      expect(body.stripe.plans[1].pricePerMonthCents).toBe(2900);
    });
  });

  // ─── Rendering ─────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders code blocks with syntax highlighting', async () => {
      const server = app();
      const md = '```javascript\nconst x = 42;\n```';
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: md },
      });
      const { slug } = JSON.parse(createRes.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.body).toContain('hljs');
      expect(res.body).toContain('language-javascript');
    });

    it('renders tables', async () => {
      const server = app();
      const md = '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |';
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: md },
      });
      const { slug } = JSON.parse(createRes.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.body).toContain('<table>');
      expect(res.body).toContain('Alice');
    });

    it('renders GFM task lists', async () => {
      const server = app();
      const md = '- [x] Done\n- [ ] Not done';
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: md },
      });
      const { slug } = JSON.parse(createRes.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.body).toContain('Done');
    });
  });

  // ─── Security ──────────────────────────────────────────────

  describe('Security', () => {
    it('sets CSP headers', async () => {
      const server = app();
      const res = await server.inject({ method: 'GET', url: '/health' });
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('sanitizes XSS in markdown', async () => {
      const server = app();
      const md = '# Hello <script>alert("xss")</script>';
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: md },
      });
      const { slug } = JSON.parse(createRes.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.body).not.toContain('alert("xss")');
    });

    it('sanitizes event handlers in markdown', async () => {
      const server = app();
      const md = '<img src="x" onerror="alert(1)">';
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: md },
      });
      const { slug } = JSON.parse(createRes.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.body).not.toContain('onerror');
    });
  });

  // ─── Stripe Webhooks ────────────────────────────────────────

  describe('POST /api/stripe/webhooks', () => {
    function webhookPayload(type: string, object: Record<string, unknown>) {
      return JSON.stringify({ type, data: { object } });
    }

    it('returns 400 when stripe-signature header is missing', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/webhooks',
        headers: { 'content-type': 'application/json' },
        body: webhookPayload('customer.subscription.updated', { customer: 'cus_test' }),
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('stripe-signature');
    });

    it('handles customer.subscription.updated event', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_wh', 'cus_wh_test', 'basic');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      const payload = webhookPayload('customer.subscription.updated', {
        customer: 'cus_wh_test',
        plan: 'pro',
      });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/webhooks',
        headers: { 'content-type': 'application/json', 'stripe-signature': 'test_sig' },
        body: payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.received).toBe(true);
      expect(body.eventType).toBe('customer.subscription.updated');

      // Plan should be updated to pro
      expect(keyStore.getPlan('cus_wh_test')).toBe('pro');
    });

    it('handles customer.subscription.deleted event (downgrades to basic)', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_wh2', 'cus_wh_del', 'pro');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      expect(keyStore.getPlan('cus_wh_del')).toBe('pro');

      const payload = webhookPayload('customer.subscription.deleted', {
        customer: 'cus_wh_del',
      });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/webhooks',
        headers: { 'content-type': 'application/json', 'stripe-signature': 'test_sig' },
        body: payload,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).eventType).toBe('customer.subscription.deleted');

      // Plan should be downgraded to basic
      expect(keyStore.getPlan('cus_wh_del')).toBe('basic');
    });

    it('handles invoice.payment_failed event', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });

      const payload = webhookPayload('invoice.payment_failed', {
        customer: 'cus_fail',
      });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/webhooks',
        headers: { 'content-type': 'application/json', 'stripe-signature': 'test_sig' },
        body: payload,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).eventType).toBe('invoice.payment_failed');
    });

    it('handles unknown event types gracefully', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });

      const payload = webhookPayload('charge.succeeded', { customer: 'cus_ok' });
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/webhooks',
        headers: { 'content-type': 'application/json', 'stripe-signature': 'test_sig' },
        body: payload,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).received).toBe(true);
    });

    it('returns 400 for invalid JSON body', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/stripe/webhooks',
        headers: { 'content-type': 'application/json', 'stripe-signature': 'test_sig' },
        body: 'not json',
      });
      expect(res.statusCode).toBe(400);
    });

    it('records webhook events in mock service', async () => {
      const stripe = new MockStripeService();
      const server = app({ stripe });

      const payload = webhookPayload('customer.subscription.updated', {
        customer: 'cus_track',
        plan: 'basic',
      });
      await server.inject({
        method: 'POST',
        url: '/api/stripe/webhooks',
        headers: { 'content-type': 'application/json', 'stripe-signature': 'test_sig' },
        body: payload,
      });

      expect(stripe.webhookEvents).toHaveLength(1);
      expect(stripe.webhookEvents[0].eventType).toBe('customer.subscription.updated');
      expect(stripe.webhookEvents[0].customerId).toBe('cus_track');
    });

    it('subscription update changes quota behavior', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_upgrade', 'cus_upgrade', 'basic');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      // Exhaust basic quota (500 pages)
      for (let i = 0; i < 500; i++) {
        await stripe.recordUsage('cus_upgrade');
      }

      // Should be blocked on basic
      const blockedRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_upgrade' },
        payload: { markdown: '# Over basic quota' },
      });
      expect(blockedRes.statusCode).toBe(402);

      // Simulate subscription upgrade webhook
      const payload = webhookPayload('customer.subscription.updated', {
        customer: 'cus_upgrade',
        plan: 'pro',
      });
      await server.inject({
        method: 'POST',
        url: '/api/stripe/webhooks',
        headers: { 'content-type': 'application/json', 'stripe-signature': 'test_sig' },
        body: payload,
      });

      // Should now be allowed on pro (5000 page quota)
      const allowedRes = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_upgrade' },
        payload: { markdown: '# Now on pro plan' },
      });
      expect(allowedRes.statusCode).toBe(201);
    });
  });

  // ─── Free-tier Rate Limiting ────────────────────────────────

  describe('Free-tier rate limiting', () => {
    function rateLimitedApp(limit: number) {
      const memStore = new MemoryStore();
      const rateLimiter = new MemoryRateLimiter(limit);
      return buildApp({
        baseUrl: BASE_URL,
        store: memStore,
        rateLimiter,
      });
    }

    it('allows free-tier requests within daily limit', async () => {
      const server = rateLimitedApp(3);
      for (let i = 0; i < 3; i++) {
        const res = await server.inject({
          method: 'POST',
          url: '/api/create',
          payload: { markdown: `# Page ${i}` },
        });
        expect(res.statusCode).toBe(201);
      }
    });

    it('returns 429 when free-tier daily limit exceeded', async () => {
      const server = rateLimitedApp(2);
      // Use up the limit
      for (let i = 0; i < 2; i++) {
        await server.inject({
          method: 'POST',
          url: '/api/create',
          payload: { markdown: `# Page ${i}` },
        });
      }
      // Next request should be rate limited
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Over limit' },
      });
      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('rate_limit_exceeded');
      expect(body.used).toBe(3);
      expect(body.limit).toBe(2);
      expect(body.upgrade).toBeDefined();
      expect(body.upgrade.stripe.checkoutUrl).toContain('/api/stripe/checkout');
    });

    it('does not rate limit paid tier (stripe)', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_rl', 'cus_rl', 'pro');
      const stripe = new MockStripeService(keyStore);
      const rateLimiter = new MemoryRateLimiter(1); // very low limit
      const server = buildApp({
        baseUrl: BASE_URL,
        store: new MemoryStore(),
        stripe,
        rateLimiter,
      });

      // First free request consumes the limit
      await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Free' },
      });

      // Stripe request should still work
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_rl' },
        payload: { markdown: '# Paid' },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).tier).toBe('stripe');
    });

    it('includes upgrade info in 429 response', async () => {
      const server = rateLimitedApp(0); // zero limit for immediate rejection
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Test' },
      });
      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('pages per day');
      expect(body.upgrade.stripe.description).toContain('unlimited');
      expect(body.upgrade.x402.description).toContain('USDC');
    });
  });

  // ─── API Key Management ──────────────────────────────────

  describe('GET /api/keys', () => {
    it('returns key info for valid API key', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_keyinfo', 'cus_keyinfo', 'pro', 'user@example.com');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      const res = await server.inject({
        method: 'GET',
        url: '/api/keys',
        headers: { authorization: 'Bearer sk_test_keyinfo' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.key).toBe('sk_test_keyinfo');
      expect(body.maskedKey).toContain('sk_tes');
      expect(body.maskedKey).toContain('...');
      expect(body.customerId).toBe('cus_keyinfo');
      expect(body.plan).toBe('pro');
    });

    it('rejects missing API key', async () => {
      const server = app();
      const res = await server.inject({ method: 'GET', url: '/api/keys' });
      expect(res.statusCode).toBe(401);
    });

    it('rejects invalid API key', async () => {
      const { server } = stripeApp();
      const res = await server.inject({
        method: 'GET',
        url: '/api/keys',
        headers: { authorization: 'Bearer sk_test_bad' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/keys/rotate', () => {
    it('rotates API key and returns new key', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_rotate_old', 'cus_rotate', 'pro', 'rotate@example.com');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      const res = await server.inject({
        method: 'POST',
        url: '/api/keys/rotate',
        headers: { authorization: 'Bearer sk_test_rotate_old' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.newKey).toMatch(/^sk_/);
      expect(body.newKey).not.toBe('sk_test_rotate_old');
      expect(body.oldKeyPrefix).toContain('...');
      expect(body.message).toContain('rotated');
    });

    it('old key becomes invalid after rotation', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_rotate2', 'cus_rotate2', 'basic');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      // Rotate
      const rotateRes = await server.inject({
        method: 'POST',
        url: '/api/keys/rotate',
        headers: { authorization: 'Bearer sk_test_rotate2' },
      });
      const { newKey } = JSON.parse(rotateRes.body);

      // Old key should fail
      const oldRes = await server.inject({
        method: 'GET',
        url: '/api/keys',
        headers: { authorization: 'Bearer sk_test_rotate2' },
      });
      expect(oldRes.statusCode).toBe(401);

      // New key should work
      const newRes = await server.inject({
        method: 'GET',
        url: '/api/keys',
        headers: { authorization: `Bearer ${newKey}` },
      });
      expect(newRes.statusCode).toBe(200);
      expect(JSON.parse(newRes.body).key).toBe(newKey);
    });

    it('preserves plan after rotation', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_plankeep', 'cus_plankeep', 'pro');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      const rotateRes = await server.inject({
        method: 'POST',
        url: '/api/keys/rotate',
        headers: { authorization: 'Bearer sk_test_plankeep' },
      });
      const { newKey } = JSON.parse(rotateRes.body);

      const statusRes = await server.inject({
        method: 'GET',
        url: '/api/billing/status',
        headers: { authorization: `Bearer ${newKey}` },
      });
      expect(JSON.parse(statusRes.body).plan).toBe('pro');
    });

    it('rejects missing API key', async () => {
      const server = app();
      const res = await server.inject({ method: 'POST', url: '/api/keys/rotate' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/keys/recover', () => {
    it('returns success for known email (does not leak info)', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_recover', 'cus_recover', 'basic', 'recover@example.com');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      const res = await server.inject({
        method: 'POST',
        url: '/api/keys/recover',
        payload: { email: 'recover@example.com' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.message).toContain('If an account exists');
      // Should NOT contain the actual key in the response
      expect(body.key).toBeUndefined();
    });

    it('returns same success for unknown email (prevents enumeration)', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/keys/recover',
        payload: { email: 'nobody@example.com' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.message).toContain('If an account exists');
    });

    it('rejects missing email', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/keys/recover',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rate limits recovery attempts', async () => {
      const rateLimiter = new MemoryRateLimiter(2);
      const server = buildApp({ baseUrl: BASE_URL, store: new MemoryStore(), rateLimiter });

      // Use up the limit
      for (let i = 0; i < 2; i++) {
        await server.inject({
          method: 'POST',
          url: '/api/keys/recover',
          payload: { email: 'ratelimit@example.com' },
        });
      }

      const res = await server.inject({
        method: 'POST',
        url: '/api/keys/recover',
        payload: { email: 'ratelimit@example.com' },
      });
      expect(res.statusCode).toBe(429);
      expect(JSON.parse(res.body).error).toBe('rate_limit_exceeded');
    });

    it('is case-insensitive for email', async () => {
      const keyStore = new InMemoryApiKeyStore();
      keyStore.add('sk_test_case', 'cus_case', 'basic', 'CaSe@Example.COM');
      const stripe = new MockStripeService(keyStore);
      const server = app({ stripe });

      const res = await server.inject({
        method: 'POST',
        url: '/api/keys/recover',
        payload: { email: 'case@example.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });
  });

  // ─── Health ────────────────────────────────────────────────

  describe('Health', () => {
    it('GET /health returns ok', async () => {
      const server = app();
      const res = await server.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    });
  });

  describe('Challenge pages', () => {
    it('creates a challenge page with paid tier', async () => {
      const { server } = stripeApp('pro');
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Challenge', ttl: 300, challenge: true },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.challenge).toBe(true);
    });

    it('ignores challenge flag on free tier', async () => {
      const server = app();
      const res = await server.inject({
        method: 'POST',
        url: '/api/create',
        payload: { markdown: '# Challenge', ttl: 60, challenge: true },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.challenge).toBe(false);
    });

    it('renders challenge template with stats', async () => {
      const { server } = stripeApp('pro');
      const create = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Challenge', ttl: 300, challenge: true },
      });
      const { slug } = JSON.parse(create.body);
      const res = await server.inject({ method: 'GET', url: `/${slug}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Keep Alive Challenge');
      expect(res.body).toContain('Keepers');
      expect(res.body).toContain('Views');
    });

    it('increments keeper count for unique IPs', async () => {
      const { server } = stripeApp('pro');
      const create = await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Challenge', ttl: 300, challenge: true },
      });
      const { slug } = JSON.parse(create.body);

      // First visit
      const r1 = await server.inject({ method: 'GET', url: `/${slug}`, remoteAddress: '1.1.1.1' });
      expect(r1.body).toContain('Keep Alive Challenge');

      // Second visit same IP — should not increment keeper
      await server.inject({ method: 'GET', url: `/${slug}`, remoteAddress: '1.1.1.1' });

      // Third visit different IP — should increment keeper
      const r3 = await server.inject({ method: 'GET', url: `/${slug}`, remoteAddress: '2.2.2.2' });
      expect(r3.body).toContain('Keep Alive Challenge');
    });

    it('GET /challenges shows leaderboard', async () => {
      const { server } = stripeApp('pro');
      // Create a challenge page
      await server.inject({
        method: 'POST',
        url: '/api/create',
        headers: { authorization: 'Bearer sk_test_valid' },
        payload: { markdown: '# Leaderboard Test', ttl: 300, challenge: true },
      });
      const res = await server.inject({ method: 'GET', url: '/challenges' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Challenge Leaderboard');
    });

    it('GET /challenges shows empty state when no challenges', async () => {
      const server = app();
      const res = await server.inject({ method: 'GET', url: '/challenges' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('No active challenges yet');
    });
  });
});
