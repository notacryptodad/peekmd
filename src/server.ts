import Fastify from 'fastify';
import { nanoid } from 'nanoid';
import type { PageStore } from './types.js';
import { renderMarkdown } from './render.js';
import { sanitize } from './sanitize-node.js';
import { pageTemplate, notFoundTemplate, landingTemplate } from './template.js';
import { MemoryStore } from './memory-store.js';
import { detectTier, validateTierTtl, TIER_CONFIGS, X402_PRICE_DISPLAY, SUBSCRIPTION_PLANS, isValidPlan } from './tiers.js';
import type { SubscriptionPlan } from './tiers.js';
import type { ApiKeyRecord } from './stripe.js';
import type { StripeService } from './stripe.js';
import { MockStripeService, InMemoryApiKeyStore, StripeClient } from './stripe.js';
import { buildPaymentRequired, verifyPayment, isX402Configured } from './x402.js';
import type { X402Config } from './x402.js';
import { DEMO_MARKDOWN } from './demo.js';
import { ogImageSvg } from './og-image.js';

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

  // OG image for social sharing
  app.get('/og-image.svg', async (_request, reply) => {
    return reply
      .type('image/svg+xml')
      .header('Cache-Control', 'public, max-age=86400')
      .send(ogImageSvg());
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

    // For stripe: validate API key first (needed for plan-aware TTL check)
    let stripeKeyRecord: ApiKeyRecord | undefined;
    let subscriberPlan: SubscriptionPlan | undefined;
    if (tier === 'stripe') {
      if (!apiKey) {
        return reply.status(401).send({ error: 'Missing API key' });
      }
      stripeKeyRecord = await stripe.validateApiKey(apiKey);
      if (!stripeKeyRecord) {
        return reply.status(401).send({ error: 'Invalid API key' });
      }
      subscriberPlan = await stripe.getSubscriberPlan(stripeKeyRecord.stripeCustomerId) ?? 'basic';
    }

    // Validate TTL for detected tier (plan-aware for Stripe subscribers)
    const ttlResult = validateTierTtl(ttl, tier, subscriberPlan);
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
      if (ttlResult.reason === 'plan_limit') {
        const planName = SUBSCRIPTION_PLANS[subscriberPlan ?? 'basic'].name;
        const maxSec = SUBSCRIPTION_PLANS[subscriberPlan ?? 'basic'].maxTtlSec;
        return reply.status(402).send({
          error: 'plan_limit',
          message: `Your ${planName} plan allows a maximum TTL of ${maxSec} seconds (${Math.floor(maxSec / 86400)} days). Upgrade to Pro for permanent pages.`,
          maxTtlSeconds: maxSec,
          upgrade: {
            description: 'Upgrade to Pro for unlimited TTL and permanent pages.',
            checkoutUrl: `${baseUrl}/api/stripe/checkout`,
            portalUrl: `${baseUrl}/api/stripe/portal`,
          },
        });
      }
      return reply.status(400).send({ error: 'ttl must be a finite number >= 0' });
    }
    const ttlSec = ttlResult.ttlSec;

    // Stripe tier: check quota and record usage (key already validated above)
    if (tier === 'stripe') {
      const quota = await stripe.checkQuota(stripeKeyRecord!.stripeCustomerId);
      if (!quota.allowed) {
        return reply.status(402).send({
          error: 'quota_exceeded',
          message: `Monthly quota exceeded. Used ${quota.pagesUsed}/${quota.quotaLimit} pages this billing period.`,
          pagesUsed: quota.pagesUsed,
          quotaLimit: quota.quotaLimit,
          remaining: 0,
          upgrade: {
            description: 'Upgrade your plan for a higher page quota.',
            checkoutUrl: `${baseUrl}/api/stripe/checkout`,
            portalUrl: `${baseUrl}/api/stripe/portal`,
          },
        });
      }
      stripe.recordUsage(stripeKeyRecord!.stripeCustomerId).catch(() => {});
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

  // POST /api/demo — create a demo page with sample markdown
  app.post('/api/demo', async (_request, reply) => {
    const slug = nanoid(SLUG_LENGTH);
    const now = Date.now();
    const ttlSec = TIER_CONFIGS.free.maxTtlSec;
    const expiresAt = now + ttlSec * 1000;
    const html = renderMarkdown(DEMO_MARKDOWN, sanitize);
    await store.set({ slug, html, markdown: DEMO_MARKDOWN, createdAt: now, expiresAt, tier: 'free' });
    const url = `${baseUrl}/${slug}`;
    return reply.status(201).send({ url, slug, expiresAt: new Date(expiresAt).toISOString(), tier: 'free' });
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

  // ─── Stripe Webhooks ─────────────────────────────────────────

  // POST /api/stripe/webhooks — handle Stripe webhook events
  // Registered in a plugin so the raw-body content parser is scoped to this route only.
  app.register(async function webhookPlugin(instance) {
    instance.removeAllContentTypeParsers();
    instance.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      done(null, body);
    });

    instance.post('/api/stripe/webhooks', async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string;
      if (!signature) {
        return reply.status(400).send({ error: 'Missing stripe-signature header' });
      }
      const rawBody = request.body as string;
      const result = await stripe.handleWebhook(rawBody, signature);
      if (!result.received) {
        return reply.status(400).send({ error: result.error ?? 'Webhook processing failed' });
      }
      return reply.send({ received: true, eventType: result.eventType });
    });
  });

  // ─── Stripe Checkout Flow ────────────────────────────────────

  // POST /api/stripe/checkout — create a Stripe Checkout session
  app.post<{
    Body: { plan?: string };
  }>('/api/stripe/checkout', async (request, reply) => {
    const { plan: planParam } = request.body ?? {};
    let plan: SubscriptionPlan | undefined;
    if (planParam !== undefined) {
      if (!isValidPlan(planParam)) {
        return reply.status(400).send({
          error: 'invalid_plan',
          message: `Invalid plan "${planParam}". Valid plans: ${Object.keys(SUBSCRIPTION_PLANS).join(', ')}`,
        });
      }
      plan = planParam;
    }
    try {
      const result = await stripe.createCheckoutSession(baseUrl, plan);
      return reply.send({
        url: result.url,
        sessionId: result.sessionId,
        plan: plan ?? null,
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

  // GET /api/stripe/portal — redirect to Stripe Customer Portal
  app.get('/api/stripe/portal', async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer\s+sk_/i.test(authorization)) {
      return reply.status(401).send({ error: 'Stripe API key required' });
    }
    const apiKey = authorization.replace(/^Bearer\s+/i, '');
    const keyRecord = await stripe.validateApiKey(apiKey);
    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }
    try {
      const result = await stripe.createPortalSession(keyRecord.stripeCustomerId, baseUrl);
      return reply.redirect(result.url, 303);
    } catch (err) {
      return reply.status(500).send({
        error: 'portal_failed',
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
    const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, config]) => ({
      plan: key,
      name: config.name,
      pagesPerMonth: config.pagesPerMonth,
      checkoutUrl: `${baseUrl}/api/stripe/checkout`,
    }));
    return reply.send({
      free: {
        maxTtlSeconds: TIER_CONFIGS.free.maxTtlSec,
        adBanner: true,
        price: 'free',
      },
      stripe: {
        maxTtlSeconds: 'unlimited',
        adBanner: false,
        plans,
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
        planPriceIds: {
          basic: process.env.STRIPE_BASIC_PRICE_ID,
          pro: process.env.STRIPE_PRO_PRICE_ID,
        },
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
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
