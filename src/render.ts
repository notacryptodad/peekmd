/**
 * Markdown-to-HTML rendering via marked + highlight.js.
 * Sanitizes output via DOMPurify.
 */

import { marked } from 'marked';
import hljs from 'highlight.js';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

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

// DOMPurify setup via jsdom
const window = new JSDOM('').window;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const purify = DOMPurify(window as any);

// Allow class attributes for highlight.js styling
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'strong', 'em', 'del', 'img',
    'span', 'div', 'sup', 'sub',
    'input', // for task lists
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class',
    'target', 'rel',
    'type', 'checked', 'disabled', // task list checkboxes
  ],
  ALLOW_DATA_ATTR: false,
};

export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown) as string;
  return purify.sanitize(raw, PURIFY_CONFIG);
}
