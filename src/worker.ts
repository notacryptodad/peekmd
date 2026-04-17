/**
 * Cloudflare Workers entry point for peekmd SaaS mode.
 * Uses KV for storage with native TTL expiry.
 */

import { nanoid } from 'nanoid';
import { renderMarkdown } from './render.js';
import { sanitize } from './sanitize-worker.js';
import { pageTemplate, notFoundTemplate, landingTemplate, checkoutSuccessTemplate } from './template.js';
import { KVStore, type KVNamespace } from './kv-store.js';
import type { PageStore } from './types.js';
import { detectTier, validateTierTtl, TIER_CONFIGS, X402_PRICE_DISPLAY, SUBSCRIPTION_PLANS, isValidPlan } from './tiers.js';
import type { SubscriptionPlan } from './tiers.js';
import type { ApiKeyRecord } from './stripe.js';
import { KVApiKeyStore, InMemoryApiKeyStore, MockStripeService, StripeClient } from './stripe.js';
import type { StripeService } from './stripe.js';
import { sendApiKeyEmail, sendRotationEmail, sendRecoveryEmail } from './email.js';
import { buildPaymentRequired, verifyPayment, isX402Configured } from './x402.js';
import type { X402Config } from './x402.js';
import { DEMO_MARKDOWN } from './demo.js';
import { ogImageSvg } from './og-image.js';
import { KVRateLimiter, rateLimitResponse } from './rate-limit.js';

const MAX_MARKDOWN_BYTES = 512_000;
const SLUG_LENGTH = 8;

interface Env {
  PAGES: KVNamespace;
  BASE_URL?: string;
  STRIPE_API_KEYS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_BASIC_PRICE_ID?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
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
  // Use KV-backed store for persistent API key storage
  const kvApiKeyStore = new KVApiKeyStore(env.PAGES);
  if (env.STRIPE_SECRET_KEY) {
    return new StripeClient({
      secretKey: env.STRIPE_SECRET_KEY,
      keyStore: kvApiKeyStore,
      priceId: env.STRIPE_PRICE_ID,
      planPriceIds: {
        basic: env.STRIPE_BASIC_PRICE_ID,
        pro: env.STRIPE_PRO_PRICE_ID,
      },
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    });
  }
  // Fallback: in-memory store for dev/mock mode (seed from env if available)
  const memStore = new InMemoryApiKeyStore(env.STRIPE_API_KEYS);
  return new MockStripeService(memStore);
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
  rateLimiter: KVRateLimiter,
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

  // Free-tier rate limiting: 20 pages/day per IP
  if (tier === 'free') {
    const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
    const rl = await rateLimiter.consume(ip);
    if (!rl.allowed) {
      return json(rateLimitResponse(rl, baseUrl), 429);
    }
  }

  // For stripe: validate API key first (needed for plan-aware TTL check)
  let stripeKeyRecord: ApiKeyRecord | undefined;
  let subscriberPlan: SubscriptionPlan | undefined;
  if (tier === 'stripe') {
    if (!apiKey) return json({ error: 'Missing API key' }, 401);
    stripeKeyRecord = await stripe.validateApiKey(apiKey);
    if (!stripeKeyRecord) return json({ error: 'Invalid API key' }, 401);
    subscriberPlan = await stripe.getSubscriberPlan(stripeKeyRecord.stripeCustomerId) ?? 'basic';
  }

  // Validate TTL for detected tier (plan-aware for Stripe subscribers)
  const ttlResult = validateTierTtl(ttl, tier, subscriberPlan);
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
    if (ttlResult.reason === 'plan_limit') {
      const planName = SUBSCRIPTION_PLANS[subscriberPlan ?? 'basic'].name;
      const maxSec = SUBSCRIPTION_PLANS[subscriberPlan ?? 'basic'].maxTtlSec;
      return json({
        error: 'plan_limit',
        message: `Your ${planName} plan allows a maximum TTL of ${maxSec} seconds (${Math.floor(maxSec / 86400)} days). Upgrade to Pro for permanent pages.`,
        maxTtlSeconds: maxSec,
        upgrade: {
          description: 'Upgrade to Pro for unlimited TTL and permanent pages.',
          checkoutUrl: `${baseUrl}/api/stripe/checkout`,
          portalUrl: `${baseUrl}/api/stripe/portal`,
        },
      }, 402);
    }
    return json({ error: 'ttl must be a finite number >= 0' }, 400);
  }
  const ttlSec = ttlResult.ttlSec;

  // Stripe tier: check quota and record usage (key already validated above)
  if (tier === 'stripe') {
    const quota = await stripe.checkQuota(stripeKeyRecord!.stripeCustomerId);
    if (!quota.allowed) {
      return json({
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
      }, 402);
    }
    stripe.recordUsage(stripeKeyRecord!.stripeCustomerId).catch(() => {});
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
  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, config]) => ({
    plan: key,
    name: config.name,
    pagesPerMonth: config.pagesPerMonth,
    pricePerMonthCents: config.pricePerMonthCents,
    checkoutUrl: `${baseUrl}/api/stripe/checkout`,
  }));
  return json({
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

    if (url.pathname === '/og-image.svg' && request.method === 'GET') {
      return new Response(ogImageSvg(), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
          ...CSP_HEADERS,
        },
      });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ status: 'ok' });
    }

    if (url.pathname === '/api/pricing' && request.method === 'GET') {
      return handlePricing(baseUrl, x402Config);
    }

    if (url.pathname === '/api/create' && request.method === 'POST') {
      const rateLimiter = new KVRateLimiter(env.PAGES);
      return handleCreate(request, store, baseUrl, stripe, x402Config, rateLimiter);
    }

    if (url.pathname === '/api/demo' && request.method === 'POST') {
      const slug = nanoid(SLUG_LENGTH);
      const now = Date.now();
      const ttlSec = TIER_CONFIGS.free.maxTtlSec;
      const expiresAt = now + ttlSec * 1000;
      const renderedHtml = renderMarkdown(DEMO_MARKDOWN, sanitize);
      await store.set({ slug, html: renderedHtml, markdown: DEMO_MARKDOWN, createdAt: now, expiresAt, tier: 'free' });
      const pageUrl = `${baseUrl}/${slug}`;
      return json({ url: pageUrl, slug, expiresAt: new Date(expiresAt).toISOString(), tier: 'free' }, 201);
    }

    // Stripe Checkout flow
    if (url.pathname === '/api/stripe/checkout' && request.method === 'POST') {
      let planParam: string | undefined;
      try {
        const body = await request.json() as { plan?: string };
        planParam = body.plan;
      } catch {
        // empty body is fine — plan is optional
      }
      let plan: SubscriptionPlan | undefined;
      if (planParam !== undefined) {
        if (!isValidPlan(planParam)) {
          return json({
            error: 'invalid_plan',
            message: `Invalid plan "${planParam}". Valid plans: ${Object.keys(SUBSCRIPTION_PLANS).join(', ')}`,
          }, 400);
        }
        plan = planParam;
      }
      try {
        const result = await stripe.createCheckoutSession(baseUrl, plan);
        return json({
          url: result.url,
          sessionId: result.sessionId,
          plan: plan ?? null,
          message: 'Redirect the user to the checkout URL. After payment, they will receive an API key.',
        });
      } catch (err) {
        return json({ error: 'checkout_failed', message: (err as Error).message }, 500);
      }
    }

    // Stripe Webhooks
    if (url.pathname === '/api/stripe/webhooks' && request.method === 'POST') {
      const signature = request.headers.get('stripe-signature');
      if (!signature) return json({ error: 'Missing stripe-signature header' }, 400);
      const rawBody = await request.text();
      const result = await stripe.handleWebhook(rawBody, signature);
      if (!result.received) {
        return json({ error: result.error ?? 'Webhook processing failed' }, 400);
      }
      return json({ received: true, eventType: result.eventType });
    }

    if (url.pathname === '/api/stripe/callback' && request.method === 'GET') {
      const sessionId = url.searchParams.get('session_id');
      if (!sessionId) return json({ error: 'Missing session_id parameter' }, 400);
      try {
        const result = await stripe.handleCheckoutCallback(sessionId);
        // Send API key email in the background (non-blocking)
        if (result.email && env.RESEND_API_KEY) {
          sendApiKeyEmail({
            resendApiKey: env.RESEND_API_KEY,
            from: env.RESEND_FROM_EMAIL ?? 'peekmd <keys@peekmd.dev>',
            to: result.email,
            apiKey: result.apiKey,
            plan: result.plan,
            baseUrl,
          }).catch(() => {}); // fire-and-forget
        }
        return html(checkoutSuccessTemplate({ apiKey: result.apiKey, baseUrl }));
      } catch (err) {
        return json({ error: 'callback_failed', message: (err as Error).message }, 400);
      }
    }

    const burnMatch = url.pathname.match(/^\/api\/burn\/([^/]+)$/);
    if (burnMatch && request.method === 'POST') {
      return handleBurn(burnMatch[1], store);
    }

    // Stripe Customer Portal
    if (url.pathname === '/api/stripe/portal' && request.method === 'GET') {
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer\s+sk_/i.test(authorization)) {
        return json({ error: 'Stripe API key required' }, 401);
      }
      const apiKey = authorization.replace(/^Bearer\s+/i, '');
      const keyRecord = await stripe.validateApiKey(apiKey);
      if (!keyRecord) return json({ error: 'Invalid API key' }, 401);
      try {
        const result = await stripe.createPortalSession(keyRecord.stripeCustomerId, baseUrl);
        return Response.redirect(result.url, 303);
      } catch (err) {
        return json({ error: 'portal_failed', message: (err as Error).message }, 500);
      }
    }

    // ─── API Key Management ────────────────────────────────────

    // GET /api/keys — view current API key
    if (url.pathname === '/api/keys' && request.method === 'GET') {
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer\s+sk_/i.test(authorization)) {
        return json({ error: 'API key required. Pass Authorization: Bearer sk_...' }, 401);
      }
      const apiKey = authorization.replace(/^Bearer\s+/i, '');
      const keyRecord = await stripe.validateApiKey(apiKey);
      if (!keyRecord) return json({ error: 'Invalid API key' }, 401);
      const info = await stripe.getKeyInfo(keyRecord.stripeCustomerId);
      if (!info) return json({ error: 'Key info not found' }, 404);
      return json({
        key: info.key,
        maskedKey: info.maskedKey,
        customerId: info.customerId,
        plan: info.plan ?? null,
      });
    }

    // POST /api/keys/rotate — rotate API key
    if (url.pathname === '/api/keys/rotate' && request.method === 'POST') {
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer\s+sk_/i.test(authorization)) {
        return json({ error: 'API key required. Pass Authorization: Bearer sk_...' }, 401);
      }
      const apiKey = authorization.replace(/^Bearer\s+/i, '');
      const keyRecord = await stripe.validateApiKey(apiKey);
      if (!keyRecord) return json({ error: 'Invalid API key' }, 401);
      try {
        const result = await stripe.rotateApiKey(keyRecord.stripeCustomerId);
        const info = await stripe.getKeyInfo(keyRecord.stripeCustomerId);
        if (info?.email && env.RESEND_API_KEY) {
          sendRotationEmail({
            resendApiKey: env.RESEND_API_KEY,
            from: env.RESEND_FROM_EMAIL ?? 'peekmd <keys@peekmd.dev>',
            to: info.email,
            newApiKey: result.newKey,
            oldKeyPrefix: result.oldKeyPrefix,
            baseUrl,
          }).catch(() => {});
        }
        return json({
          newKey: result.newKey,
          oldKeyPrefix: result.oldKeyPrefix,
          message: 'API key rotated. The old key is now invalid.',
          emailSent: !!(info?.email && env.RESEND_API_KEY),
        });
      } catch (err) {
        return json({ error: 'rotation_failed', message: (err as Error).message }, 500);
      }
    }

    // POST /api/keys/recover — send current key to subscriber email
    if (url.pathname === '/api/keys/recover' && request.method === 'POST') {
      let body: { email?: string };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400);
      }
      const { email } = body;
      if (!email || typeof email !== 'string') {
        return json({ error: 'email is required' }, 400);
      }
      const rateLimiter = new KVRateLimiter(env.PAGES);
      const rl = await rateLimiter.consume(`recover:${email.toLowerCase()}`);
      if (!rl.allowed) {
        return json({
          error: 'rate_limit_exceeded',
          message: 'Too many recovery attempts. Try again tomorrow.',
        }, 429);
      }
      const successResponse = {
        ok: true,
        message: 'If an account exists with that email, the API key has been sent.',
      };
      const info = await stripe.recoverKeyByEmail(email);
      if (!info) return json(successResponse);
      if (info.email && env.RESEND_API_KEY) {
        sendRecoveryEmail({
          resendApiKey: env.RESEND_API_KEY,
          from: env.RESEND_FROM_EMAIL ?? 'peekmd <keys@peekmd.dev>',
          to: info.email,
          apiKey: info.key,
          baseUrl,
        }).catch(() => {});
      }
      return json(successResponse);
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
