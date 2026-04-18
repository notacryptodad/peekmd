# peekmd

Beautiful markdown, one link away.

[![ClawHub](https://img.shields.io/badge/ClawHub-peekmd-blue)](https://clawhub.com/notacryptodad/peekmd)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

POST markdown to the API, get back a shareable link to a beautifully rendered, auto-expiring HTML page. Built for AI agents, bots, and developers who need to share rich content without fighting chat app formatting.

**Live:** [peekmd.dev](https://peekmd.dev)

## Quick Start

```bash
curl -X POST https://peekmd.dev/api/create \
  -H "Content-Type: application/json" \
  -d '{"markdown": "# Hello World\n\nThis is a **peekmd** page."}'
```

Response:

```json
{
  "url": "https://peekmd.dev/aBcDeFgH",
  "slug": "aBcDeFgH",
  "expiresAt": "2026-03-22T04:30:00.000Z",
  "tier": "free"
}
```

The `url` is immediately shareable. Free pages expire in 5 minutes.

## Features

- GFM tables, fenced code blocks with syntax highlighting (190+ languages via highlight.js), task lists
- Dark/light mode toggle on rendered pages
- Countdown timer and burn-after-reading support
- DOMPurify sanitization for safe HTML output
- Three payment tiers: free, Stripe (subscription), x402 (crypto)
- Deploy anywhere: self-hosted (Fastify) or Cloudflare Workers

## Self-Hosted

```bash
npm install
npm run build
npm start
```

Or with a public URL via Cloudflare Quick Tunnel:

```bash
npx peekmd --tunnel
```

### CLI Options

```
peekmd [options]

  --port, -p <port>   Port to listen on (default: 3000)
  --host <host>       Host to bind to (default: 0.0.0.0)
  --tunnel, -t        Start Cloudflare Quick Tunnel for public URL
  --help, -h          Show this help message
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `HOST` | Bind address (default: 0.0.0.0) |
| `BASE_URL` | Base URL for generated links |
| `STRIPE_SECRET_KEY` | Stripe secret key (enables paid tier) |
| `STRIPE_BASIC_PRICE_ID` | Stripe price ID for Basic plan |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro plan |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_API_KEYS` | Pre-seeded API keys (JSON) |
| `X402_WALLET_ADDRESS` | Wallet address for x402 payments |
| `X402_NETWORK` | Network for x402 (default: base-sepolia) |

## Cloudflare Workers

peekmd is deployed on Cloudflare Workers with KV storage for page persistence.

```bash
npx wrangler deploy
```

## API

### `POST /api/create`

Create a rendered markdown page.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `markdown` | string | yes | Markdown content (max 500 KB) |
| `ttl` | number | no | Time-to-live in seconds (0 = permanent*, default: 300) |

\* Permanent pages are kept alive as long as they are accessed at least once every 90 days. Pages with no views for 90 days are automatically removed.

### `GET /:slug`

Returns the rendered HTML page.

### `POST /api/burn/:slug`

Delete a page immediately.

### `GET /api/pricing`

Returns pricing details for all tiers.

### `GET /health`

Health check.

## Payment Tiers

| Tier | Max TTL | Ad Banner | Auth | Price |
|------|---------|-----------|------|-------|
| free | 5 min | yes | none | free |
| stripe | unlimited | no | `Authorization: Bearer sk_...` | $9–$29/mo |
| x402 | unlimited | no | `X-PAYMENT` header | 0.02 USDC/page |

Stripe offers two plans: **Basic** ($9/mo, 500 pages, 30-day max TTL) and **Pro** ($29/mo, 5,000 pages, permanent TTL). Permanent pages with no views for 90 days are automatically removed.

## Development

```bash
npm install
npm run dev          # watch mode
npm test             # run tests
npm run build        # compile TypeScript
```

## License

[MIT](LICENSE)

## Links

- [ClawHub](https://clawhub.com/notacryptodad/peekmd)
- [Live Demo](https://peekmd.dev)
- [GitHub](https://github.com/notacryptodad/peekmd)
