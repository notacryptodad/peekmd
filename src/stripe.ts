/**
 * Stripe integration for metered billing.
 * API key validation, usage recording, billing status, and checkout flow.
 */

import Stripe from 'stripe';
import { nanoid } from 'nanoid';
import type { SubscriptionPlan } from './tiers.js';
import { SUBSCRIPTION_PLANS } from './tiers.js';

export interface ApiKeyRecord {
  key: string;
  stripeCustomerId: string;
}

export interface BillingStatus {
  customerId: string;
  currentPeriodUsage: number;
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

export interface StripeService {
  validateApiKey(key: string): Promise<ApiKeyRecord | undefined>;
  recordUsage(customerId: string, pages?: number): Promise<void>;
  getBillingStatus(customerId: string): Promise<BillingStatus>;
  createCheckoutSession(baseUrl: string, plan?: SubscriptionPlan): Promise<CheckoutResult>;
  handleCheckoutCallback(sessionId: string): Promise<CheckoutCallbackResult>;
  createPortalSession(customerId: string, returnUrl: string): Promise<PortalSessionResult>;
  isConfigured(): boolean;
}

/** Generate a peekmd API key. */
export function generateApiKey(): string {
  return `sk_${nanoid(32)}`;
}

/**
 * In-memory API key store. Seeded from a config string.
 * Format: "sk_test_abc:cus_xxx,sk_test_def:cus_yyy"
 */
export class InMemoryApiKeyStore {
  private keys = new Map<string, ApiKeyRecord>();

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

  add(key: string, stripeCustomerId: string): void {
    this.keys.set(key, { key, stripeCustomerId });
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

  constructor(opts: {
    secretKey: string;
    keyStore: InMemoryApiKeyStore;
    meterEventName?: string;
    priceId?: string;
    planPriceIds?: Partial<Record<SubscriptionPlan, string>>;
  }) {
    this.stripe = new Stripe(opts.secretKey);
    this.keyStore = opts.keyStore;
    this.meterEventName = opts.meterEventName ?? 'peekmd_page_created';
    this.priceId = opts.priceId;
    this.planPriceIds = opts.planPriceIds ?? {};
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

  async getBillingStatus(customerId: string): Promise<BillingStatus> {
    return {
      customerId,
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
}

/**
 * Mock Stripe service for testing and when STRIPE_SECRET_KEY is not set.
 */
export class MockStripeService implements StripeService {
  public usageRecords: Array<{ customerId: string; pages: number }> = [];
  public checkoutSessions = new Map<string, { customerId: string; plan?: SubscriptionPlan }>();
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

  async recordUsage(customerId: string, pages = 1): Promise<void> {
    this.usageRecords.push({ customerId, pages });
  }

  async getBillingStatus(customerId: string): Promise<BillingStatus> {
    const usage = this.usageRecords
      .filter((r) => r.customerId === customerId)
      .reduce((sum, r) => sum + r.pages, 0);
    return { customerId, currentPeriodUsage: usage };
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
    this.keyStore.add(apiKey, session.customerId);
    this.checkoutSessions.delete(sessionId);
    return { apiKey, customerId: session.customerId };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSessionResult> {
    return { url: `${returnUrl}?portal=mock&customer=${customerId}` };
  }
}
