/**
 * Markdown-to-HTML rendering via marked + highlight.js.
 * Sanitizer is injected so this module works in both Node and Workers.
 */

import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked with highlight.js
marked.setOptions({
  gfm: true,
  breaks: false,
});

const renderer = new marked.Renderer();

// Syntax highlighting for fenced code blocks
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

marked.use({ renderer });

export type Sanitizer = (html: string) => string;

export function renderMarkdown(markdown: string, sanitize?: Sanitizer): string {
  const raw = marked.parse(markdown) as string;
  return sanitize ? sanitize(raw) : raw;
}

// ── Allowed tags/attrs shared between sanitizer implementations ──

export const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'strong', 'em', 'del', 'img',
  'span', 'div', 'sup', 'sub',
  'input', // for task lists
]);

export const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'class',
  'target', 'rel',
  'type', 'checked', 'disabled', // task list checkboxes
]);
