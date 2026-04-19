# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

peekmd is a markdown-to-HTML rendering service. POST markdown, get a shareable link to a beautifully rendered page. Dual deployment: Cloudflare Workers (SaaS at peekmd.dev) and self-hosted via Fastify.

## Commands

```bash
npm run build          # tsc → dist/
npm run dev            # Watch mode (tsx watch src/cli.ts)
npm test               # vitest run (all tests)
npx vitest run src/server.test.ts          # Single test file
npx vitest run -t "returns 402"            # Tests matching name pattern
npm start              # Run compiled server (dist/cli.js)
npx wrangler deploy    # Deploy to Cloudflare Workers (prod)
npx wrangler deploy --env test             # Deploy to staging (test.peekmd.dev)
```

## Architecture

### Dual Deployment Model

The core logic is shared between two entry points that diverge only in HTTP layer, storage, and sanitization:

- **`server.ts`** — Fastify app via `buildApp()` with dependency injection (store, stripe, x402, rateLimiter). Used for self-hosted and tests.
- **`worker.ts`** — Cloudflare Worker with manual URL parsing. Same route handlers, different platform bindings.

Platform-specific code is isolated by convention: `sanitize-node.ts` / `sanitize-worker.ts`, `memory-store.ts` / `kv-store.ts`. When adding a feature that touches platform-specific behavior, update both paths.

### Request Flow

```
POST /api/create → detectTier (Stripe > x402 > free) → rate limit check (free only)
  → validateTierTtl → render (marked GFM + highlight.js) → sanitize (DOMPurify or regex)
  → generate 8-char nanoid slug → store.set() → return {url, slug, expiresAt, tier}

GET /:slug → store.get() → check expiration → challenge logic (if applicable)
  → pageTemplate (dark/light, countdown, burn button, ad banner if free) → HTML
```

### Payment Tiers

Three tiers detected statelessly per-request from headers:

| Tier | Auth Header | TTL Cap | Rate Limit |
|------|------------|---------|------------|
| free | none | 5 min (300s) | 20 pages/day per IP |
| stripe | `Authorization: Bearer sk_*` | Plan-dependent (basic=30d, pro=unlimited) | Monthly quota (basic=500, pro=5000) |
| x402 | `X-PAYMENT` | Unlimited | Per-transaction |

TTL=0 means permanent (Stripe pro and x402 only). Violating tier limits returns 402 with upgrade links, not 400.

### Storage

`PageStore` interface: `get(slug)`, `set(page)`, `burn(slug)`. Both implementations enforce 90-day rolling eviction for permanent pages (MemoryStore via background sweep, KVStore via TTL refresh on read).

### Stripe Flow

Checkout → callback generates `sk_*` API key (nanoid(32)) → stored in `ApiKeyStore` → emailed via Resend (fire-and-forget). Metered billing records usage per page creation. Webhook handles plan changes (`customer.subscription.updated/deleted`).

### Challenge Pages

Paid-tier "keep-alive" feature: pages extend TTL based on unique visitor IPs (10-min cooldown per IP). Tracked via `ChallengeMeta` in store. Challenge pages can't be burned.

## Key Conventions

- **ESM-only**: `"type": "module"` — use `.js` extensions in imports
- **Tests co-located**: `src/foo.test.ts` next to `src/foo.ts`
- **Test pattern**: `buildApp()` + Fastify `.inject()` for route testing
- **worker.ts excluded from tsc**: compiled separately by wrangler (see `tsconfig.json` exclude)
- **Slugs**: 8-character nanoid
- **Max markdown**: 500 KB
- **CSP**: `default-src 'none'; script-src 'unsafe-inline'` — inline scripts only for theme toggle
- **Templates**: CSS variables for dark/light mode; theme stored in localStorage key `theme`
- **Emails**: All non-blocking (fire-and-forget via Resend API)
- **BaseUrl**: Injected everywhere — supports self-hosted, Workers, and Quick Tunnel URLs

## Environment Variables

See README.md for the full list. Key ones for development:
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID` — Stripe integration
- `X402_WALLET_ADDRESS`, `X402_NETWORK` — x402 payments
- `RESEND_API_KEY` — Email via Resend
- `BASE_URL` — Override generated link base URL

## Links

- **Live:** https://peekmd.dev
- **Staging:** https://test.peekmd.dev
- **GitHub:** https://github.com/notacryptodad/peekmd
- **License:** MIT
