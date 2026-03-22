/** Demo markdown shown when visitors click "View Demo" on the landing page. */

export const DEMO_MARKDOWN = `# Welcome to peekmd

Beautiful markdown rendering, one link away.

## Features

- **Syntax highlighting** for 190+ languages
- Dark and light mode (auto-detected)
- Auto-expiring pages with countdown timer
- Burn after reading — one-click delete

## Code Example

\`\`\`typescript
// Post markdown, get a shareable link
const response = await fetch("https://peekmd.peekmd.workers.dev/api/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    markdown: "# Hello World\\nYour markdown here.",
  }),
});

const { url, slug, expiresAt } = await response.json();
console.log("Share this link:", url);
\`\`\`

## Tables

| Tier | TTL | Ad Banner | Price |
|------|-----|-----------|-------|
| Free | 5 min | Yes | $0 |
| Stripe | Unlimited | No | $0.001–$0.01 |
| x402 | Unlimited | No | 0.001 USDC |

## Blockquotes

> peekmd is built for AI agents, bots, and developers who need to share
> rich content without fighting chat app formatting.

---

*This demo page expires in 5 minutes. Try creating your own!*
`;
