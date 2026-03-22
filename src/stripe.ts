/**
 * Stripe integration for metered billing.
 * API key validation, usage recording, billing status.
 */

import Stripe from 'stripe';

export interface ApiKeyRecord {
  key: string;
  stripeCustomerId: string;
}

export interface BillingStatus {
  customerId: string;
  currentPeriodUsage: number;
}

export interface StripeService {
  validateApiKey(key: string): Promise<ApiKeyRecord | undefined>;
  recordUsage(customerId: string, pages?: number): Promise<void>;
  getBillingStatus(customerId: string): Promise<BillingStatus>;
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
          const customerId = parts.slice(1).join(':'); // handle colons in customer IDs
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
 * Live Stripe integration. Reports usage via Billing Meter Events.
 * Requires STRIPE_SECRET_KEY and a pre-configured Stripe Billing Meter.
 */
export class StripeClient implements StripeService {
  private stripe: Stripe;
  private keyStore: InMemoryApiKeyStore;
  private meterEventName: string;

  constructor(opts: {
    secretKey: string;
    keyStore: InMemoryApiKeyStore;
    meterEventName?: string;
  }) {
    this.stripe = new Stripe(opts.secretKey);
    this.keyStore = opts.keyStore;
    this.meterEventName = opts.meterEventName ?? 'peekmd_page_created';
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
}

/**
 * Mock Stripe service for testing and when STRIPE_SECRET_KEY is not set.
 * Validates API keys but records usage in-memory only.
 */
export class MockStripeService implements StripeService {
  public usageRecords: Array<{ customerId: string; pages: number }> = [];
  private keyStore: InMemoryApiKeyStore;

  constructor(keyStore?: InMemoryApiKeyStore) {
    this.keyStore = keyStore ?? new InMemoryApiKeyStore();
  }

  get store(): InMemoryApiKeyStore {
    return this.keyStore;
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
}
