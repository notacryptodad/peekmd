# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

peekmd is a markdown-to-HTML rendering service. POST markdown, get a shareable link to a beautifully rendered page. Two deployment targets: Cloudflare Workers (SaaS) and self-hosted via Fastify.

## Commands

```bash
npm run build          # tsc → dist/
npm run dev            # Watch mode (tsx)
npm start              # Run compiled server (dist/cli.js)
npm test               # Vitest (all tests)
npx vitest run src/server.test.ts          # Single test file
npx vitest run -t "creates a page"         # Single test by name
npx wrangler deploy    # Deploy to Cloudflare Workers
```

## Architecture

**Dual-target design:** The same core logic (`render.ts`, `template.ts`, `tiers.ts`, `types.ts`) runs in both Node/Fastify and Cloudflare Workers. Platform-specific code is isolated into paired modules:

| Concern | Node (self-hosted) | Workers (SaaS) |
|---|---|---|
| Entry point | `cli.ts` → `server.ts` (`buildApp()`) | `worker.ts` (fetch handler) |
| Storage | `memory-store.ts` (in-memory + TTL sweep) | `kv-store.ts` (Cloudflare KV with native TTL) |
| Sanitization | `sanitize-node.ts` (DOMPurify via jsdom) | `sanitize-worker.ts` (DOMPurify built-in) |

**Request flow:** `POST /api/create` → `detectTier()` (from headers) → `validateTierTtl()` → optional Stripe/x402 auth → `renderMarkdown()` (marked + highlight.js → sanitize) → store page → return `{url, slug}`.

**`buildApp()` pattern:** The Fastify app in `server.ts` accepts injected `{store, stripe, x402}` dependencies. Tests use `MemoryStore` and `MockStripeService` directly — no HTTP mocking needed. The Worker entry (`worker.ts`) duplicates the routing logic using native `Request`/`Response` instead of Fastify.

**Payment tiers:** `tiers.ts` defines three tiers (free/stripe/x402). Tier detection is header-based: `Authorization: Bearer sk_...` → stripe, `X-PAYMENT` → x402, else free. Free tier: 5 min TTL + ad banner. Paid tiers: unlimited TTL, no ads.

## Conventions

- TypeScript ESM (`"type": "module"`), imports use `.js` extensions
- Tests co-located: `src/foo.test.ts` next to `src/foo.ts`
- Slugs: 8-character nanoid
- Max markdown size: 500 KB
- `tsconfig.json` excludes `*.test.ts` and `worker.ts` from compilation (Worker is built by wrangler)
- Templates in `template.ts` are string-literal HTML with inline CSS/JS (no bundler)

## Links

- **Live:** https://peekmd.dev
- **GitHub:** https://github.com/notacryptodad/peekmd
- **License:** MIT
