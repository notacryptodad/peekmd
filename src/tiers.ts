/**
 * Payment tier detection, configuration, and pricing.
 */

export type Tier = 'free' | 'stripe' | 'x402';

export interface TierConfig {
  maxTtlSec: number; // 0 = unlimited (permanent pages allowed)
  defaultTtlSec: number;
  showAdBanner: boolean;
}

export const TIER_CONFIGS: Record<Tier, TierConfig> = {
  free: { maxTtlSec: 300, defaultTtlSec: 300, showAdBanner: true },
  stripe: { maxTtlSec: 0, defaultTtlSec: 86400, showAdBanner: false },
  x402: { maxTtlSec: 0, defaultTtlSec: 86400, showAdBanner: false },
};

export interface TierDetection {
  tier: Tier;
  apiKey?: string;
  paymentHeader?: string;
}

/**
 * Detect payment tier from request headers.
 * - Stripe: Authorization: Bearer sk_...
 * - x402: X-PAYMENT header present
 * - Free: default (no auth)
 */
export function detectTier(
  authorization?: string | null,
  paymentHeader?: string | null,
): TierDetection {
  if (authorization && /^Bearer\s+sk_/i.test(authorization)) {
    return { tier: 'stripe', apiKey: authorization.replace(/^Bearer\s+/i, '') };
  }
  if (paymentHeader) {
    return { tier: 'x402', paymentHeader };
  }
  return { tier: 'free' };
}

/**
 * Validate TTL for a given tier.
 * Returns validated TTL in seconds, or signals that payment/upgrade is needed.
 * TTL = 0 means permanent (only available for paid tiers with sufficient plan).
 *
 * For Stripe subscribers, pass the subscription plan to enforce plan-specific
 * TTL caps (e.g. Basic = 30 days, Pro = permanent).
 */
export function validateTierTtl(
  ttl: number | undefined,
  tier: Tier,
  plan?: SubscriptionPlan,
): { ok: true; ttlSec: number } | { ok: false; reason: 'payment_required' | 'plan_limit' | 'invalid' } {
  const config = TIER_CONFIGS[tier];

  // No TTL specified → use tier default
  if (ttl === undefined) {
    return { ok: true, ttlSec: config.defaultTtlSec };
  }

  // Type validation
  if (typeof ttl !== 'number' || !Number.isFinite(ttl)) {
    return { ok: false, reason: 'invalid' };
  }

  // Resolve effective max TTL: plan-specific for stripe, otherwise tier config
  let maxTtlSec = config.maxTtlSec;
  if (tier === 'stripe') {
    const resolvedPlan = plan ?? 'basic';
    maxTtlSec = SUBSCRIPTION_PLANS[resolvedPlan].maxTtlSec;
  }

  // Permanent page (ttl = 0)
  if (ttl === 0) {
    if (maxTtlSec === 0) return { ok: true, ttlSec: 0 };
    return { ok: false, reason: tier === 'free' ? 'payment_required' : 'plan_limit' };
  }

  const ttlSec = Math.floor(ttl);
  if (ttlSec < 1) {
    return { ok: false, reason: 'invalid' };
  }

  // Tier/plan limit check (maxTtlSec = 0 means unlimited)
  if (maxTtlSec > 0 && ttlSec > maxTtlSec) {
    return { ok: false, reason: tier === 'free' ? 'payment_required' : 'plan_limit' };
  }

  return { ok: true, ttlSec };
}

// ─── Subscription Plans ──────────────────────────────────────

export type SubscriptionPlan = 'basic' | 'pro';

export interface SubscriptionPlanConfig {
  name: string;
  pagesPerMonth: number;
  pricePerMonthCents: number;
  priceIdEnvVar: string;
  maxTtlSec: number; // 0 = unlimited (permanent pages allowed)
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, SubscriptionPlanConfig> = {
  basic: {
    name: 'Basic',
    pagesPerMonth: 500,
    pricePerMonthCents: 900,
    priceIdEnvVar: 'STRIPE_BASIC_PRICE_ID',
    maxTtlSec: 2_592_000, // 30 days
  },
  pro: {
    name: 'Pro',
    pagesPerMonth: 5000,
    pricePerMonthCents: 2900,
    priceIdEnvVar: 'STRIPE_PRO_PRICE_ID',
    maxTtlSec: 0, // unlimited (permanent)
  },
};

export function isValidPlan(plan: string): plan is SubscriptionPlan {
  return plan === 'basic' || plan === 'pro';
}

/** Stripe pricing in cents per page, scaled by TTL. */
export function stripePriceCents(ttlSec: number): number {
  if (ttlSec === 0) return 1.0; // $0.01 for permanent
  if (ttlSec <= 3600) return 0.1; // $0.001
  if (ttlSec <= 86400) return 0.5; // $0.005
  return 1.0; // $0.01
}

/** x402 price in USDC atomic units (6 decimals). 0.02 USDC = 20000. */
export const X402_PRICE_USDC = '20000';
export const X402_PRICE_DISPLAY = '0.02';
