/**
 * Free-tier rate limiting: 20 pages/day per IP.
 * Uses UTC-day buckets for simplicity.
 */

import type { KVNamespace } from './kv-store.js';

export const FREE_DAILY_LIMIT = 20;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  used: number;
  limit: number;
  /** UTC date string (YYYY-MM-DD) for the current bucket */
  resetDate: string;
}

export interface RateLimiter {
  /** Check and increment the counter for an IP. Returns the result after incrementing. */
  consume(ip: string): Promise<RateLimitResult>;
}

/** Returns UTC date string like "2026-04-16" */
function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * In-memory rate limiter for self-hosted (Fastify) deployment.
 * Buckets auto-clear when the date changes.
 */
export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, number>();
  private currentDate = utcDateKey();

  constructor(private limit = FREE_DAILY_LIMIT) {}

  async consume(ip: string): Promise<RateLimitResult> {
    const today = utcDateKey();
    if (today !== this.currentDate) {
      this.buckets.clear();
      this.currentDate = today;
    }

    const used = (this.buckets.get(ip) ?? 0) + 1;
    this.buckets.set(ip, used);

    return {
      allowed: used <= this.limit,
      remaining: Math.max(0, this.limit - used),
      used,
      limit: this.limit,
      resetDate: today,
    };
  }

  /** For testing: get current count for an IP */
  getCount(ip: string): number {
    return this.buckets.get(ip) ?? 0;
  }

  /** For testing: reset all buckets */
  clear(): void {
    this.buckets.clear();
  }
}

/**
 * KV-backed rate limiter for Cloudflare Workers.
 * Stores counters in KV with 24h TTL keyed by "ratelimit:{date}:{ip}".
 */
export class KVRateLimiter implements RateLimiter {
  constructor(
    private kv: KVNamespace,
    private limit = FREE_DAILY_LIMIT,
  ) {}

  async consume(ip: string): Promise<RateLimitResult> {
    const today = utcDateKey();
    const key = `ratelimit:${today}:${ip}`;

    const raw = await this.kv.get(key, { type: 'text' });
    const used = (raw ? parseInt(raw, 10) : 0) + 1;

    // Write with 24h TTL so old entries auto-expire
    await this.kv.put(key, String(used), { expirationTtl: 86400 });

    return {
      allowed: used <= this.limit,
      remaining: Math.max(0, this.limit - used),
      used,
      limit: this.limit,
      resetDate: today,
    };
  }
}

/** Build 429 response body for rate-limited requests */
export function rateLimitResponse(result: RateLimitResult, baseUrl: string) {
  return {
    error: 'rate_limit_exceeded',
    message: `Free tier is limited to ${result.limit} pages per day. You have used ${result.used}. Upgrade to a paid plan for unlimited pages.`,
    used: result.used,
    limit: result.limit,
    resetDate: result.resetDate,
    upgrade: {
      stripe: {
        description: 'Subscribe for unlimited daily pages, extended TTLs, and no ad banner.',
        checkoutUrl: `${baseUrl}/api/stripe/checkout`,
      },
      x402: {
        description: 'Pay per request with USDC — no account or daily limit.',
      },
    },
  };
}
