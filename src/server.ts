import Fastify from 'fastify';
import { nanoid } from 'nanoid';
import type { PageStore } from './types.js';
import { renderMarkdown } from './render.js';
import { sanitize } from './sanitize-node.js';
import { pageTemplate, notFoundTemplate, landingTemplate } from './template.js';
import { MemoryStore } from './memory-store.js';
import { detectTier, validateTierTtl, TIER_CONFIGS, X402_PRICE_DISPLAY } from './tiers.js';
import type { StripeService } from './stripe.js';
import { MockStripeService, InMemoryApiKeyStore, StripeClient } from './stripe.js';
import { buildPaymentRequired, verifyPayment, isX402Configured } from './x402.js';
import type { X402Config } from './x402.js';

const MAX_MARKDOWN_BYTES = 512_000; // 500 KB
const SLUG_LENGTH = 8;

export { MAX_MARKDOWN_BYTES, SLUG_LENGTH };

export interface AppOptions {
  baseUrl?: string;
  store?: PageStore;
  stripe?: StripeService;
  x402?: Partial<X402Config>;
}

/**
 * Build the 402 response body for free-tier users requesting paid features.
 * Explains upgrade options clearly for both agents and humans.
 */
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

  // Also include x402 protocol header if configured
  if (isX402Configured(x402Config)) {
    const { body, header } = buildPaymentRequired(x402Config as X402Config, `${baseUrl}/api/create`);
    response.x402 = (body as Record<string, unknown>).x402;
    response._x402Header = header;
  }

  return response;
}

export function buildApp(opts?: AppOptions) {
  const baseUrl = opts?.baseUrl ?? '';
  const store = opts?.store ?? new MemoryStore();
  const stripe = opts?.stripe ?? new MockStripeService();
  const x402Config = opts?.x402 ?? {};

  const app = Fastify({ logger: false });

  // CSP headers on all responses
  app.addHook('onSend', async (_req, reply) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; frame-ancestors 'none'",
    );
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  // Landing page
  app.get('/', async (_request, reply) => {
    return reply.type('text/html').send(landingTemplate(baseUrl));
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // POST /api/create
  app.post<{
    Body: { markdown: string; ttl?: number };
  }>('/api/create', async (request, reply) => {
    const { markdown, ttl } = request.body ?? {};

    // Validate markdown
    if (typeof markdown !== 'string' || markdown.trim().length === 0) {
      return reply.status(400).send({ error: 'markdown is required and must be a non-empty string' });
    }
    if (Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES) {
      return reply.status(400).send({ error: `markdown exceeds maximum size of ${MAX_MARKDOWN_BYTES} bytes` });
    }

    // Detect payment tier from headers
    const authorization = request.headers.authorization ?? null;
    const paymentHeader = (request.headers['x-payment'] as string) ?? null;
    const { tier, apiKey, paymentHeader: receipt } = detectTier(authorization, paymentHeader);

    // Validate TTL for detected tier
    const ttlResult = validateTierTtl(ttl, tier);
    if (!ttlResult.ok) {
      if (ttlResult.reason === 'payment_required') {
        const body = paymentRequiredResponse(baseUrl, x402Config);
        const headers: Record<string, string> = {};
        if (body._x402Header) {
          headers['X-Payment-Required'] = body._x402Header as string;
          delete body._x402Header;
        }
        reply.status(402);
        for (const [k, v] of Object.entries(headers)) reply.header(k, v);
        return reply.send(body);
      }
      return reply.status(400).send({ error: 'ttl must be a finite number >= 0' });
    }
    const ttlSec = ttlResult.ttlSec;

    // Stripe tier: validate API key and record usage
    if (tier === 'stripe') {
      if (!apiKey) {
        return reply.status(401).send({ error: 'Missing API key' });
      }
      const keyRecord = await stripe.validateApiKey(apiKey);
      if (!keyRecord) {
        return reply.status(401).send({ error: 'Invalid API key' });
      }
      stripe.recordUsage(keyRecord.stripeCustomerId).catch(() => {});
    }

    // x402 tier: verify payment receipt
    if (tier === 'x402') {
      if (!receipt) {
        return reply.status(400).send({ error: 'Missing X-PAYMENT header' });
      }
      if (!isX402Configured(x402Config)) {
        return reply.status(501).send({ error: 'x402 payments not configured on this server' });
      }
      const payResult = await verifyPayment(receipt, x402Config as X402Config, `${baseUrl}/api/create`);
      if (!payResult.valid) {
        return reply.status(402).send({
          error: 'payment_failed',
          message: payResult.error ?? 'Payment verification failed',
        });
      }
    }

    const slug = nanoid(SLUG_LENGTH);
    const now = Date.now();
    const expiresAt = ttlSec === 0 ? 0 : now + ttlSec * 1000;

    const html = renderMarkdown(markdown, sanitize);

    await store.set({ slug, html, markdown, createdAt: now, expiresAt, tier });

    const url = `${baseUrl}/${slug}`;
    return reply.status(201).send({
      url,
      slug,
      expiresAt: expiresAt === 0 ? null : new Date(expiresAt).toISOString(),
      tier,
    });
  });

  // POST /api/burn/:slug
  app.post<{ Params: { slug: string } }>('/api/burn/:slug', async (request, reply) => {
    const { slug } = request.params;
    const burned = await store.burn(slug);
    if (!burned) {
      return reply.status(404).send({ error: 'page not found' });
    }
    return reply.status(200).send({ ok: true });
  });

  // ─── Stripe Checkout Flow ────────────────────────────────────

  // POST /api/stripe/checkout — create a Stripe Checkout session
  app.post('/api/stripe/checkout', async (_request, reply) => {
    try {
      const result = await stripe.createCheckoutSession(baseUrl);
      return reply.send({
        url: result.url,
        sessionId: result.sessionId,
        message: 'Redirect the user to the checkout URL. After payment, they will receive an API key.',
      });
    } catch (err) {
      return reply.status(500).send({
        error: 'checkout_failed',
        message: (err as Error).message,
      });
    }
  });

  // GET /api/stripe/callback — handle post-checkout redirect, return API key
  app.get<{
    Querystring: { session_id?: string };
  }>('/api/stripe/callback', async (request, reply) => {
    const sessionId = request.query.session_id;
    if (!sessionId) {
      return reply.status(400).send({ error: 'Missing session_id parameter' });
    }
    try {
      const result = await stripe.handleCheckoutCallback(sessionId);
      return reply.send({
        apiKey: result.apiKey,
        customerId: result.customerId,
        message:
          'Subscription active. Use this API key as Authorization: Bearer ' +
          result.apiKey +
          ' on all requests to bypass the free tier limits and ad banner.',
      });
    } catch (err) {
      return reply.status(400).send({
        error: 'callback_failed',
        message: (err as Error).message,
      });
    }
  });

  // GET /api/billing/status — Stripe billing status
  app.get('/api/billing/status', async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+sk_/i.test(authorization)) {
      return reply.status(401).send({ error: 'Stripe API key required' });
    }
    const apiKey = authorization.replace(/^Bearer\s+/i, '');
    const keyRecord = await stripe.validateApiKey(apiKey);
    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }
    const status = await stripe.getBillingStatus(keyRecord.stripeCustomerId);
    return reply.send(status);
  });

  // GET /api/pricing — show pricing info for all tiers
  app.get('/api/pricing', async (_request, reply) => {
    return reply.send({
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
  });

  // GET /:slug — serve rendered page
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const { slug } = request.params;
    const page = await store.get(slug);

    if (!page) {
      return reply.status(404).type('text/html').send(notFoundTemplate());
    }

    const tier = page.tier ?? 'free';
    const showAdBanner = TIER_CONFIGS[tier].showAdBanner;

    const html = pageTemplate({
      html: page.html,
      slug: page.slug,
      expiresAt: page.expiresAt,
      baseUrl,
      showAdBanner,
    });

    return reply.type('text/html').send(html);
  });

  return app;
}

// Start server when run directly
const isMain = process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts');
if (isMain) {
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  const HOST = process.env.HOST ?? '0.0.0.0';
  const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

  const memStore = new MemoryStore();
  memStore.startSweep();

  // Stripe config
  const apiKeyStore = new InMemoryApiKeyStore(process.env.STRIPE_API_KEYS);
  const stripeService: StripeService = process.env.STRIPE_SECRET_KEY
    ? new StripeClient({
        secretKey: process.env.STRIPE_SECRET_KEY,
        keyStore: apiKeyStore,
        meterEventName: process.env.STRIPE_METER_EVENT_NAME,
        priceId: process.env.STRIPE_PRICE_ID,
      })
    : new MockStripeService(apiKeyStore);

  // x402 config
  const x402Config: Partial<X402Config> = {
    walletAddress: process.env.X402_WALLET_ADDRESS,
    network: process.env.X402_NETWORK ?? 'base-sepolia',
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator',
    assetAddress: process.env.X402_ASSET_ADDRESS,
  };

  const app = buildApp({ baseUrl: BASE_URL, store: memStore, stripe: stripeService, x402: x402Config });
  app.listen({ port: PORT, host: HOST }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`peekmd listening on ${address}`);
  });
}
