/**
 * Cloudflare Workers entry point for peekmd SaaS mode.
 * Uses KV for storage with native TTL expiry.
 */

import { nanoid } from 'nanoid';
import { renderMarkdown } from './render.js';
import { pageTemplate, notFoundTemplate } from './template.js';
import { KVStore, type KVNamespace } from './kv-store.js';
import type { PageStore } from './types.js';

const DEFAULT_TTL_SEC = 5 * 60;
const MAX_TTL_SEC = 24 * 60 * 60;
const MAX_MARKDOWN_BYTES = 512_000;
const SLUG_LENGTH = 8;

interface Env {
  PAGES: KVNamespace;
  BASE_URL?: string;
}

const CSP_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CSP_HEADERS },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CSP_HEADERS },
  });
}

async function handleCreate(request: Request, store: PageStore, baseUrl: string): Promise<Response> {
  let body: { markdown?: string; ttl?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const { markdown, ttl } = body;

  if (typeof markdown !== 'string' || markdown.trim().length === 0) {
    return json({ error: 'markdown is required and must be a non-empty string' }, 400);
  }
  if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN_BYTES) {
    return json({ error: `markdown exceeds maximum size of ${MAX_MARKDOWN_BYTES} bytes` }, 400);
  }

  let ttlSec = DEFAULT_TTL_SEC;
  if (ttl !== undefined) {
    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl < 1 || ttl > MAX_TTL_SEC) {
      return json({ error: `ttl must be a number between 1 and ${MAX_TTL_SEC} seconds` }, 400);
    }
    ttlSec = Math.floor(ttl);
  }

  const slug = nanoid(SLUG_LENGTH);
  const now = Date.now();
  const expiresAt = now + ttlSec * 1000;
  const renderedHtml = renderMarkdown(markdown);

  await store.set({ slug, html: renderedHtml, markdown, createdAt: now, expiresAt });

  const url = `${baseUrl}/${slug}`;
  return json({ url, slug, expiresAt: new Date(expiresAt).toISOString() }, 201);
}

async function handleBurn(slug: string, store: PageStore): Promise<Response> {
  const burned = await store.burn(slug);
  if (!burned) {
    return json({ error: 'page not found' }, 404);
  }
  return json({ ok: true });
}

async function handleGet(slug: string, store: PageStore, baseUrl: string): Promise<Response> {
  const page = await store.get(slug);
  if (!page) {
    return html(notFoundTemplate(), 404);
  }
  return html(
    pageTemplate({
      html: page.html,
      slug: page.slug,
      expiresAt: page.expiresAt,
      baseUrl,
    })
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const store = new KVStore(env.PAGES);
    const url = new URL(request.url);
    const baseUrl = env.BASE_URL || url.origin;

    // Route matching
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ status: 'ok' });
    }

    if (url.pathname === '/api/create' && request.method === 'POST') {
      return handleCreate(request, store, baseUrl);
    }

    const burnMatch = url.pathname.match(/^\/api\/burn\/([^/]+)$/);
    if (burnMatch && request.method === 'POST') {
      return handleBurn(burnMatch[1], store);
    }

    const slugMatch = url.pathname.match(/^\/([^/]+)$/);
    if (slugMatch && request.method === 'GET') {
      return handleGet(slugMatch[1], store, baseUrl);
    }

    return json({ error: 'not found' }, 404);
  },
};
