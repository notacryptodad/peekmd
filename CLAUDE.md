# peekmd — CLAUDE.md

Project conventions and context for AI coding assistants.

## What This Is

peekmd is a markdown-to-HTML rendering service. POST markdown, get a shareable link to a beautifully rendered page. Deployed on Cloudflare Workers (SaaS) and runnable self-hosted via Fastify.

## Stack

- **Language:** TypeScript (ESM, `"type": "module"`)
- **Self-hosted server:** Fastify 5
- **Edge deployment:** Cloudflare Workers (`wrangler.toml`, `src/worker.ts`)
- **Markdown:** marked (GFM mode)
- **Syntax highlighting:** highlight.js (190+ languages)
- **Sanitization:** DOMPurify (Node: jsdom, Workers: built-in)
- **Storage:** MemoryStore (self-hosted), Cloudflare KV (Workers)
- **Tests:** Vitest
- **Payments:** Stripe (metered billing), x402 (USDC)

## Project Layout

```
src/
  server.ts        # Fastify app builder (buildApp)
  worker.ts        # Cloudflare Worker entry point
  cli.ts           # CLI entry (peekmd command)
  render.ts        # Markdown → HTML rendering
  template.ts      # HTML page templates (page, landing, 404)
  types.ts         # Shared types (PageStore, PageRecord)
  memory-store.ts  # In-memory store with TTL sweep
  kv-store.ts      # Cloudflare KV store adapter
  tiers.ts         # Payment tier logic and config
  stripe.ts        # Stripe integration
  x402.ts          # x402 payment protocol
  sanitize-node.ts # DOMPurify sanitizer (Node/jsdom)
  sanitize-worker.ts # DOMPurify sanitizer (Workers)
  tunnel.ts        # Cloudflare Quick Tunnel helper
  demo.ts          # Demo markdown content
  *.test.ts        # Tests (co-located)
```

## Key Commands

```bash
npm run build      # Compile TypeScript → dist/
npm run dev        # Watch mode (tsx)
npm start          # Run compiled server
npm test           # Run Vitest
npx wrangler deploy  # Deploy to Cloudflare Workers
```

## Conventions

- Tests are co-located with source files (`src/foo.test.ts`)
- Two deployment targets share the same core logic; platform-specific code is isolated (`sanitize-node.ts` vs `sanitize-worker.ts`, `memory-store.ts` vs `kv-store.ts`)
- The `buildApp()` function in `server.ts` accepts injected dependencies (store, stripe, x402) for testability
- Slugs are 8-character nanoid strings
- Max markdown size: 500 KB
- Free tier: 5 min TTL, ad banner. Paid tiers: unlimited TTL, no ads.

## Release Process

- Version is in `package.json` (`"version": "0.3.0"`)
- GitHub releases should be created for version bumps
- Cloudflare Workers deployment: `npx wrangler deploy`

## Links

- **Live:** https://peekmd.dev
- **GitHub:** https://github.com/notacryptodad/peekmd
- **ClawHub:** https://clawhub.com/notacryptodad/peekmd
- **License:** MIT
