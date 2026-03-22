import Fastify from 'fastify';
import { nanoid } from 'nanoid';
import type { PageStore } from './types.js';
import { renderMarkdown } from './render.js';
import { pageTemplate, notFoundTemplate } from './template.js';
import { MemoryStore } from './memory-store.js';

const DEFAULT_TTL_SEC = 5 * 60; // 5 minutes
const MAX_TTL_SEC = 24 * 60 * 60; // 24 hours
const MAX_MARKDOWN_BYTES = 512_000; // 500 KB
const SLUG_LENGTH = 8;

export { DEFAULT_TTL_SEC, MAX_TTL_SEC, MAX_MARKDOWN_BYTES, SLUG_LENGTH };

export function buildApp(opts?: { baseUrl?: string; store?: PageStore }) {
  const baseUrl = opts?.baseUrl ?? '';
  const store = opts?.store ?? new MemoryStore();

  const app = Fastify({ logger: false });

  // CSP headers on all responses
  app.addHook('onSend', async (_req, reply) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; frame-ancestors 'none'"
    );
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // POST /api/create
  app.post<{
    Body: { markdown: string; ttl?: number };
  }>('/api/create', async (request, reply) => {
    const { markdown, ttl } = request.body ?? {};

    // Validate markdown
    if (typeof markdown !== 'string' || markdown.trim().length === 0) {
      return reply.status(400).send({ error: 'markdown is required and must be a non-empty string' });
    }
    if (Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES) {
      return reply.status(400).send({ error: `markdown exceeds maximum size of ${MAX_MARKDOWN_BYTES} bytes` });
    }

    // Validate TTL
    let ttlSec = DEFAULT_TTL_SEC;
    if (ttl !== undefined) {
      if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl < 1 || ttl > MAX_TTL_SEC) {
        return reply.status(400).send({
          error: `ttl must be a number between 1 and ${MAX_TTL_SEC} seconds`,
        });
      }
      ttlSec = Math.floor(ttl);
    }

    const slug = nanoid(SLUG_LENGTH);
    const now = Date.now();
    const expiresAt = now + ttlSec * 1000;

    // Render markdown to sanitized HTML
    const html = renderMarkdown(markdown);

    await store.set({ slug, html, markdown, createdAt: now, expiresAt });

    const url = `${baseUrl}/${slug}`;
    return reply.status(201).send({ url, slug, expiresAt: new Date(expiresAt).toISOString() });
  });

  // POST /api/burn/:slug
  app.post<{ Params: { slug: string } }>('/api/burn/:slug', async (request, reply) => {
    const { slug } = request.params;
    const burned = await store.burn(slug);
    if (!burned) {
      return reply.status(404).send({ error: 'page not found' });
    }
    return reply.status(200).send({ ok: true });
  });

  // GET /:slug — serve rendered page
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const { slug } = request.params;
    const page = await store.get(slug);

    if (!page) {
      return reply.status(404).type('text/html').send(notFoundTemplate());
    }

    const html = pageTemplate({
      html: page.html,
      slug: page.slug,
      expiresAt: page.expiresAt,
      baseUrl,
    });

    return reply.type('text/html').send(html);
  });

  return app;
}

// Start server when run directly
const isMain = process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts');
if (isMain) {
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  const HOST = process.env.HOST ?? '0.0.0.0';
  const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

  const memStore = new MemoryStore();
  memStore.startSweep();

  const app = buildApp({ baseUrl: BASE_URL, store: memStore });
  app.listen({ port: PORT, host: HOST }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`peekmd listening on ${address}`);
  });
}
