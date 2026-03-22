/**
 * Stripe integration for metered billing.
 * API key validation, usage recording, billing status, and checkout flow.
 */

import Stripe from 'stripe';
import { nanoid } from 'nanoid';
import type { SubscriptionPlan } from './tiers.js';
import { SUBSCRIPTION_PLANS, isValidPlan } from './tiers.js';

export interface ApiKeyRecord {
  key: string;
  stripeCustomerId: string;
}

export interface BillingStatus {
  customerId: string;
  plan: string | null;
  pagesUsed: number;
  quotaLimit: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  /** @deprecated Use pagesUsed instead */
  currentPeriodUsage: number;
}

export interface QuotaCheck {
  allowed: boolean;
  pagesUsed: number;
  quotaLimit: number;
  remaining: number;
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
}

export interface CheckoutCallbackResult {
  apiKey: string;
  customerId: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface WebhookResult {
  received: boolean;
  eventType?: string;
  customerId?: string;
  error?: string;
}

export interface StripeService {
  validateApiKey(key: string): Promise<ApiKeyRecord | undefined>;
  recordUsage(customerId: string, pages?: number): Promise<void>;
  checkQuota(customerId: string): Promise<QuotaCheck>;
  getBillingStatus(customerId: string): Promise<BillingStatus>;
  createCheckoutSession(baseUrl: string, plan?: SubscriptionPlan): Promise<CheckoutResult>;
  handleCheckoutCallback(sessionId: string): Promise<CheckoutCallbackResult>;
  createPortalSession(customerId: string, returnUrl: string): Promise<PortalSessionResult>;
  handleWebhook(rawBody: string, signature: string): Promise<WebhookResult>;
  isConfigured(): boolean;
}

/** Generate a peekmd API key. */
export function generateApiKey(): string {
  return `sk_${nanoid(32)}`;
}

/** Get the current billing period key (YYYY-MM) and start/end dates. */
export function getBillingPeriod(now = new Date()): { key: string; start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  return { key, start, end };
}

/**
 * In-memory API key store. Seeded from a config string.
 * Format: "sk_test_abc:cus_xxx,sk_test_def:cus_yyy"
 */
export class InMemoryApiKeyStore {
  private keys = new Map<string, ApiKeyRecord>();
  private customerPlans = new Map<string, SubscriptionPlan>();

  constructor(keysConfig?: string) {
    if (keysConfig) {
      for (const entry of keysConfig.split(',')) {
        const parts = entry.trim().split(':');
        if (parts.length >= 2) {
          const key = parts[0];
          const customerId = parts.slice(1).join(':');
          if (key && customerId) {
            this.keys.set(key, { key, stripeCustomerId: customerId });
          }
        }
      }
    }
  }

  validate(key: string): ApiKeyRecord | undefined {
    return this.keys.get(key);
  }

  add(key: string, stripeCustomerId: string, plan?: SubscriptionPlan): void {
    this.keys.set(key, { key, stripeCustomerId });
    if (plan) {
      this.customerPlans.set(stripeCustomerId, plan);
    }
  }

  getPlan(customerId: string): SubscriptionPlan | undefined {
    return this.customerPlans.get(customerId);
  }

  setPlan(customerId: string, plan: SubscriptionPlan): void {
    this.customerPlans.set(customerId, plan);
  }

  size(): number {
    return this.keys.size;
  }
}

/**
 * Live Stripe integration.
 * Handles checkout sessions, usage reporting, and API key management.
 */
export class StripeClient implements StripeService {
  private stripe: Stripe;
  private keyStore: InMemoryApiKeyStore;
  private meterEventName: string;
  private priceId: string | undefined;
  private planPriceIds: Partial<Record<SubscriptionPlan, string>>;
  private webhookSecret: string | undefined;

  constructor(opts: {
    secretKey: string;
    keyStore: InMemoryApiKeyStore;
    meterEventName?: string;
    priceId?: string;
    planPriceIds?: Partial<Record<SubscriptionPlan, string>>;
    webhookSecret?: string;
  }) {
    this.stripe = new Stripe(opts.secretKey);
    this.keyStore = opts.keyStore;
    this.meterEventName = opts.meterEventName ?? 'peekmd_page_created';
    this.priceId = opts.priceId;
    this.planPriceIds = opts.planPriceIds ?? {};
    this.webhookSecret = opts.webhookSecret;
  }

  isConfigured(): boolean {
    return true;
  }

  async validateApiKey(key: string): Promise<ApiKeyRecord | undefined> {
    return this.keyStore.validate(key);
  }

  async recordUsage(customerId: string, pages = 1): Promise<void> {
    await this.stripe.billing.meterEvents.create({
      event_name: this.meterEventName,
      payload: {
        stripe_customer_id: customerId,
        value: String(pages),
      },
    });
  }

  async checkQuota(customerId: string): Promise<QuotaCheck> {
    const plan = this.keyStore.getPlan(customerId) ?? 'basic';
    const quotaLimit = SUBSCRIPTION_PLANS[plan].pagesPerMonth;
    // In live Stripe, we'd query meter usage. For now, return allowed.
    return { allowed: true, pagesUsed: 0, quotaLimit, remaining: quotaLimit };
  }

  async getBillingStatus(customerId: string): Promise<BillingStatus> {
    const plan = this.keyStore.getPlan(customerId) ?? 'basic';
    const quotaLimit = SUBSCRIPTION_PLANS[plan].pagesPerMonth;
    const { start, end } = getBillingPeriod();
    // In live Stripe, we'd query meter usage for the current period.
    return {
      customerId,
      plan,
      pagesUsed: 0,
      quotaLimit,
      remaining: quotaLimit,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      currentPeriodUsage: 0,
    };
  }

  async createCheckoutSession(baseUrl: string, plan?: SubscriptionPlan): Promise<CheckoutResult> {
    // Resolve price ID: plan-specific first, then legacy fallback
    const priceId = plan ? this.planPriceIds[plan] : this.priceId;
    if (!priceId) {
      const envVar = plan ? SUBSCRIPTION_PLANS[plan].priceIdEnvVar : 'STRIPE_PRICE_ID';
      throw new Error(`${envVar} not configured`);
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId }],
      success_url: `${baseUrl}/api/stripe/callback?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/api/pricing`,
    });
    return { url: session.url!, sessionId: session.id };
  }

  async handleCheckoutCallback(sessionId: string): Promise<CheckoutCallbackResult> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      throw new Error('Checkout session not completed');
    }
    const customerId = session.customer as string;
    if (!customerId) {
      throw new Error('No customer associated with checkout session');
    }
    const apiKey = generateApiKey();
    this.keyStore.add(apiKey, customerId);
    return { apiKey, customerId };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSessionResult> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  async handleWebhook(rawBody: string, signature: string): Promise<WebhookResult> {
    if (!this.webhookSecret) {
      return { received: false, error: 'STRIPE_WEBHOOK_SECRET not configured' };
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err) {
      return { received: false, error: `Signature verification failed: ${(err as Error).message}` };
    }
    return this.processWebhookEvent(event);
  }

  private processWebhookEvent(event: Stripe.Event): WebhookResult {
    const customerId = (event.data.object as { customer?: string }).customer ?? undefined;

    switch (event.type) {
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const cid = typeof sub.customer === 'string' ? sub.customer : sub.customer.toString();
        // Resolve plan from price ID
        const priceId = sub.items?.data?.[0]?.price?.id;
        if (priceId) {
          const plan = this.resolvePlanFromPriceId(priceId);
          if (plan) {
            this.keyStore.setPlan(cid, plan);
          }
        }
        return { received: true, eventType: event.type, customerId: cid };
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const cid = typeof sub.customer === 'string' ? sub.customer : sub.customer.toString();
        // Downgrade to basic on cancellation
        this.keyStore.setPlan(cid, 'basic');
        return { received: true, eventType: event.type, customerId: cid };
      }
      case 'invoice.payment_failed': {
        // Log for now — could flag customer in the future
        return { received: true, eventType: event.type, customerId };
      }
      default:
        return { received: true, eventType: event.type, customerId };
    }
  }

  private resolvePlanFromPriceId(priceId: string): SubscriptionPlan | undefined {
    for (const [plan, id] of Object.entries(this.planPriceIds)) {
      if (id === priceId) return plan as SubscriptionPlan;
    }
    return undefined;
  }
}

/**
 * Mock Stripe service for testing and when STRIPE_SECRET_KEY is not set.
 * Tracks per-customer, per-period usage for quota enforcement.
 */
export class MockStripeService implements StripeService {
  public usageRecords: Array<{ customerId: string; pages: number }> = [];
  /** Per-customer per-period usage: Map<`${customerId}:${periodKey}`, count> */
  private periodUsage = new Map<string, number>();
  public checkoutSessions = new Map<string, { customerId: string; plan?: SubscriptionPlan }>();
  public webhookEvents: Array<{ eventType: string; customerId?: string }> = [];
  private keyStore: InMemoryApiKeyStore;

  constructor(keyStore?: InMemoryApiKeyStore) {
    this.keyStore = keyStore ?? new InMemoryApiKeyStore();
  }

  get store(): InMemoryApiKeyStore {
    return this.keyStore;
  }

  isConfigured(): boolean {
    return true;
  }

  async validateApiKey(key: string): Promise<ApiKeyRecord | undefined> {
    return this.keyStore.validate(key);
  }

  private periodKey(customerId: string): string {
    const { key } = getBillingPeriod();
    return `${customerId}:${key}`;
  }

  async recordUsage(customerId: string, pages = 1): Promise<void> {
    this.usageRecords.push({ customerId, pages });
    const pk = this.periodKey(customerId);
    this.periodUsage.set(pk, (this.periodUsage.get(pk) ?? 0) + pages);
  }

  private getUsage(customerId: string): number {
    return this.periodUsage.get(this.periodKey(customerId)) ?? 0;
  }

  async checkQuota(customerId: string): Promise<QuotaCheck> {
    const plan = this.keyStore.getPlan(customerId) ?? 'basic';
    const quotaLimit = SUBSCRIPTION_PLANS[plan].pagesPerMonth;
    const pagesUsed = this.getUsage(customerId);
    const remaining = Math.max(0, quotaLimit - pagesUsed);
    return { allowed: remaining > 0, pagesUsed, quotaLimit, remaining };
  }

  async getBillingStatus(customerId: string): Promise<BillingStatus> {
    const plan = this.keyStore.getPlan(customerId) ?? 'basic';
    const quotaLimit = SUBSCRIPTION_PLANS[plan].pagesPerMonth;
    const pagesUsed = this.getUsage(customerId);
    const remaining = Math.max(0, quotaLimit - pagesUsed);
    const { start, end } = getBillingPeriod();
    return {
      customerId,
      plan,
      pagesUsed,
      quotaLimit,
      remaining,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      currentPeriodUsage: pagesUsed,
    };
  }

  async createCheckoutSession(baseUrl: string, plan?: SubscriptionPlan): Promise<CheckoutResult> {
    const sessionId = `cs_test_${nanoid(16)}`;
    const customerId = `cus_${nanoid(14)}`;
    this.checkoutSessions.set(sessionId, { customerId, plan });
    return {
      url: `${baseUrl}/api/stripe/callback?session_id=${sessionId}`,
      sessionId,
    };
  }

  async handleCheckoutCallback(sessionId: string): Promise<CheckoutCallbackResult> {
    const session = this.checkoutSessions.get(sessionId);
    if (!session) {
      throw new Error('Invalid or expired checkout session');
    }
    const apiKey = generateApiKey();
    this.keyStore.add(apiKey, session.customerId, session.plan);
    this.checkoutSessions.delete(sessionId);
    return { apiKey, customerId: session.customerId };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSessionResult> {
    return { url: `${returnUrl}?portal=mock&customer=${customerId}` };
  }

  async handleWebhook(rawBody: string, _signature: string): Promise<WebhookResult> {
    let event: { type: string; data: { object: { customer?: string; items?: { data: Array<{ price?: { id: string } }> } } } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { received: false, error: 'Invalid JSON' };
    }
    const customerId = event.data?.object?.customer;
    this.webhookEvents.push({ eventType: event.type, customerId });

    switch (event.type) {
      case 'customer.subscription.updated': {
        // In mock mode, accept a plan field on the object for testing
        const obj = event.data.object as { customer?: string; plan?: SubscriptionPlan };
        if (customerId && obj.plan && isValidPlan(obj.plan)) {
          this.keyStore.setPlan(customerId, obj.plan);
        }
        return { received: true, eventType: event.type, customerId };
      }
      case 'customer.subscription.deleted': {
        if (customerId) {
          this.keyStore.setPlan(customerId, 'basic');
        }
        return { received: true, eventType: event.type, customerId };
      }
      case 'invoice.payment_failed':
        return { received: true, eventType: event.type, customerId };
      default:
        return { received: true, eventType: event.type, customerId };
    }
  }
}
