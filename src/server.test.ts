import { describe, it, expect } from 'vitest';
import { buildApp } from './server.js';
import { MemoryStore } from './memory-store.js';
import { MockStripeService, InMemoryApiKeyStore } from './stripe.js';

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

function stripeApp() {
  const keyStore = new InMemoryApiKeyStore();
  keyStore.add('sk_test_valid', 'cus_test123');
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
    it('returns billing status for valid API key', async () => {
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

      // Then handle the callback
      const callbackRes = await server.inject({
        method: 'GET',
        url: `/api/stripe/callback?session_id=${sessionId}`,
      });
      expect(callbackRes.statusCode).toBe(200);
      const body = JSON.parse(callbackRes.body);
      expect(body.apiKey).toBeDefined();
      expect(body.apiKey).toMatch(/^sk_/);
      expect(body.customerId).toBeDefined();
      expect(body.message).toContain('Authorization: Bearer');
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
      const { apiKey } = JSON.parse(callbackRes.body);

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
      expect(body.x402.pricePerPage).toBe('0.01 USDC');
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

  // ─── Health ────────────────────────────────────────────────

  describe('Health', () => {
    it('GET /health returns ok', async () => {
      const server = app();
      const res = await server.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    });
  });
});
