/**
 * Cloudflare Workers entry point for peekmd SaaS mode.
 * Uses KV for storage with native TTL expiry.
 */

import { nanoid } from 'nanoid';
import { renderMarkdown } from './render.js';
import { sanitize } from './sanitize-worker.js';
import { pageTemplate, notFoundTemplate, landingTemplate } from './template.js';
import { KVStore, type KVNamespace } from './kv-store.js';
import type { PageStore } from './types.js';
import { detectTier, validateTierTtl, TIER_CONFIGS, X402_PRICE_DISPLAY } from './tiers.js';
import { InMemoryApiKeyStore, MockStripeService } from './stripe.js';
import type { StripeService } from './stripe.js';
import { buildPaymentRequired, verifyPayment, isX402Configured } from './x402.js';
import type { X402Config } from './x402.js';

const MAX_MARKDOWN_BYTES = 512_000;
const SLUG_LENGTH = 8;

interface Env {
  PAGES: KVNamespace;
  BASE_URL?: string;
  STRIPE_API_KEYS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  X402_WALLET_ADDRESS?: string;
  X402_NETWORK?: string;
  X402_FACILITATOR_URL?: string;
  X402_ASSET_ADDRESS?: string;
}

const CSP_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CSP_HEADERS, ...extraHeaders },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CSP_HEADERS },
  });
}

function getStripeService(env: Env): StripeService {
  const apiKeyStore = new InMemoryApiKeyStore(env.STRIPE_API_KEYS);
  return new MockStripeService(apiKeyStore);
}

function getX402Config(env: Env): Partial<X402Config> {
  return {
    walletAddress: env.X402_WALLET_ADDRESS,
    network: env.X402_NETWORK ?? 'base-sepolia',
    facilitatorUrl: env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator',
    assetAddress: env.X402_ASSET_ADDRESS,
  };
}

function paymentRequiredResponse(
  baseUrl: string,
  x402Config: Partial<X402Config>,
) {
  const response: Record<string, unknown> = {
    error: 'payment_required',
    message:
      'Free tier includes a 5-minute TTL and an ad banner on rendered pages. ' +
      'To remove the banner and unlock extended TTLs (up to permanent), choose a payment method below.',
    free: {
      maxTtlSeconds: TIER_CONFIGS.free.maxTtlSec,
      adBanner: true,
    },
    upgrade: {
      stripe: {
        description:
          'Subscribe for metered billing. After checkout you receive an API key ' +
          'to pass as Authorization: Bearer sk_... on all requests.',
        checkoutUrl: `${baseUrl}/api/stripe/checkout`,
        pricePerPage: '$0.001–$0.01 depending on TTL',
      },
      x402: isX402Configured(x402Config)
        ? {
            description:
              'Pay per request with USDC (no account needed). ' +
              'Send a request, receive 402 with payment details, pay, retry with X-PAYMENT header.',
            pricePerPage: `${X402_PRICE_DISPLAY} USDC`,
          }
        : undefined,
    },
  };

  if (isX402Configured(x402Config)) {
    const { body, header } = buildPaymentRequired(x402Config as X402Config, `${baseUrl}/api/create`);
    response.x402 = (body as Record<string, unknown>).x402;
    response._x402Header = header;
  }

  return response;
}

async function handleCreate(
  request: Request,
  store: PageStore,
  baseUrl: string,
  stripe: StripeService,
  x402Config: Partial<X402Config>,
): Promise<Response> {
  let body: { markdown?: string; ttl?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const { markdown, ttl } = body;

  if (typeof markdown !== 'string' || markdown.trim().length === 0) {
    return json({ error: 'markdown is required and must be a non-empty string' }, 400);
  }
  if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN_BYTES) {
    return json({ error: `markdown exceeds maximum size of ${MAX_MARKDOWN_BYTES} bytes` }, 400);
  }

  const authorization = request.headers.get('authorization');
  const paymentHeader = request.headers.get('x-payment');
  const { tier, apiKey, paymentHeader: receipt } = detectTier(authorization, paymentHeader);

  const ttlResult = validateTierTtl(ttl, tier);
  if (!ttlResult.ok) {
    if (ttlResult.reason === 'payment_required') {
      const prBody = paymentRequiredResponse(baseUrl, x402Config);
      const headers: Record<string, string> = {};
      if (prBody._x402Header) {
        headers['X-Payment-Required'] = prBody._x402Header as string;
        delete prBody._x402Header;
      }
      return json(prBody, 402, headers);
    }
    return json({ error: 'ttl must be a finite number >= 0' }, 400);
  }
  const ttlSec = ttlResult.ttlSec;

  if (tier === 'stripe') {
    if (!apiKey) return json({ error: 'Missing API key' }, 401);
    const keyRecord = await stripe.validateApiKey(apiKey);
    if (!keyRecord) return json({ error: 'Invalid API key' }, 401);
    stripe.recordUsage(keyRecord.stripeCustomerId).catch(() => {});
  }

  if (tier === 'x402') {
    if (!receipt) return json({ error: 'Missing X-PAYMENT header' }, 400);
    if (!isX402Configured(x402Config)) {
      return json({ error: 'x402 payments not configured' }, 501);
    }
    const payResult = await verifyPayment(receipt, x402Config as X402Config, `${baseUrl}/api/create`);
    if (!payResult.valid) {
      return json({ error: 'payment_failed', message: payResult.error }, 402);
    }
  }

  const slug = nanoid(SLUG_LENGTH);
  const now = Date.now();
  const expiresAt = ttlSec === 0 ? 0 : now + ttlSec * 1000;
  const renderedHtml = renderMarkdown(markdown, sanitize);

  await store.set({ slug, html: renderedHtml, markdown, createdAt: now, expiresAt, tier });

  const url = `${baseUrl}/${slug}`;
  return json({ url, slug, expiresAt: expiresAt === 0 ? null : new Date(expiresAt).toISOString(), tier }, 201);
}

async function handleBurn(slug: string, store: PageStore): Promise<Response> {
  const burned = await store.burn(slug);
  if (!burned) {
    return json({ error: 'page not found' }, 404);
  }
  return json({ ok: true });
}

async function handleGet(slug: string, store: PageStore, baseUrl: string): Promise<Response> {
  const page = await store.get(slug);
  if (!page) {
    return html(notFoundTemplate(), 404);
  }

  const tier = page.tier ?? 'free';
  const showAdBanner = TIER_CONFIGS[tier].showAdBanner;

  return html(
    pageTemplate({
      html: page.html,
      slug: page.slug,
      expiresAt: page.expiresAt,
      baseUrl,
      showAdBanner,
    }),
  );
}

function handlePricing(baseUrl: string, x402Config: Partial<X402Config>): Response {
  return json({
    free: {
      maxTtlSeconds: TIER_CONFIGS.free.maxTtlSec,
      adBanner: true,
      price: 'free',
    },
    stripe: {
      maxTtlSeconds: 'unlimited',
      adBanner: false,
      pricePerPage: {
        upTo1Hour: '$0.001',
        upTo24Hours: '$0.005',
        permanent: '$0.01',
      },
      auth: 'Authorization: Bearer sk_...',
      checkoutUrl: `${baseUrl}/api/stripe/checkout`,
    },
    x402: {
      maxTtlSeconds: 'unlimited',
      adBanner: false,
      pricePerPage: `${X402_PRICE_DISPLAY} USDC`,
      auth: 'X-PAYMENT header (HTTP 402 flow)',
      configured: isX402Configured(x402Config),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const store = new KVStore(env.PAGES);
    const url = new URL(request.url);
    const baseUrl = env.BASE_URL || url.origin;
    const stripe = getStripeService(env);
    const x402Config = getX402Config(env);

    // Route matching
    if (url.pathname === '/' && request.method === 'GET') {
      return html(landingTemplate(baseUrl));
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ status: 'ok' });
    }

    if (url.pathname === '/api/pricing' && request.method === 'GET') {
      return handlePricing(baseUrl, x402Config);
    }

    if (url.pathname === '/api/create' && request.method === 'POST') {
      return handleCreate(request, store, baseUrl, stripe, x402Config);
    }

    // Stripe Checkout flow
    if (url.pathname === '/api/stripe/checkout' && request.method === 'POST') {
      try {
        const result = await stripe.createCheckoutSession(baseUrl);
        return json({
          url: result.url,
          sessionId: result.sessionId,
          message: 'Redirect the user to the checkout URL. After payment, they will receive an API key.',
        });
      } catch (err) {
        return json({ error: 'checkout_failed', message: (err as Error).message }, 500);
      }
    }

    if (url.pathname === '/api/stripe/callback' && request.method === 'GET') {
      const sessionId = url.searchParams.get('session_id');
      if (!sessionId) return json({ error: 'Missing session_id parameter' }, 400);
      try {
        const result = await stripe.handleCheckoutCallback(sessionId);
        return json({
          apiKey: result.apiKey,
          customerId: result.customerId,
          message:
            'Subscription active. Use this API key as Authorization: Bearer ' +
            result.apiKey +
            ' on all requests to bypass the free tier limits and ad banner.',
        });
      } catch (err) {
        return json({ error: 'callback_failed', message: (err as Error).message }, 400);
      }
    }

    const burnMatch = url.pathname.match(/^\/api\/burn\/([^/]+)$/);
    if (burnMatch && request.method === 'POST') {
      return handleBurn(burnMatch[1], store);
    }

    if (url.pathname === '/api/billing/status' && request.method === 'GET') {
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer\s+sk_/i.test(authorization)) {
        return json({ error: 'Stripe API key required' }, 401);
      }
      const apiKey = authorization.replace(/^Bearer\s+/i, '');
      const keyRecord = await stripe.validateApiKey(apiKey);
      if (!keyRecord) return json({ error: 'Invalid API key' }, 401);
      const status = await stripe.getBillingStatus(keyRecord.stripeCustomerId);
      return json(status);
    }

    const slugMatch = url.pathname.match(/^\/([^/]+)$/);
    if (slugMatch && request.method === 'GET') {
      return handleGet(slugMatch[1], store, baseUrl);
    }

    return json({ error: 'not found' }, 404);
  },
};
