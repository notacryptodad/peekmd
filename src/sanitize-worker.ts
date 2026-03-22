/**
 * Lightweight HTML sanitizer for Cloudflare Workers (no jsdom).
 * Whitelist-based: strips disallowed tags and attributes.
 */

import { ALLOWED_TAGS, ALLOWED_ATTRS } from './render.js';
import type { Sanitizer } from './render.js';

// Self-closing tags that don't need a closing tag
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input']);

/**
 * Strip HTML tags and attributes not in the whitelist.
 * Handles opening, closing, and self-closing tags.
 */
export const sanitize: Sanitizer = (html: string): string => {
  // Match HTML tags (opening, closing, self-closing)
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)\/?>|<!--[\s\S]*?-->/g, (match, tagName, attrs) => {
    // Strip HTML comments
    if (match.startsWith('<!--')) return '';

    const tag = tagName?.toLowerCase();
    if (!tag || !ALLOWED_TAGS.has(tag)) return '';

    // Closing tag
    if (match.startsWith('</')) return `</${tag}>`;

    // Filter attributes
    const cleanAttrs = filterAttributes(attrs || '');
    const selfClose = VOID_TAGS.has(tag) ? ' /' : '';

    return `<${tag}${cleanAttrs}${selfClose}>`;
  });
};

function filterAttributes(attrString: string): string {
  const attrs: string[] = [];
  // Match attribute patterns: name="value", name='value', name=value, name (boolean)
  const attrRegex = /([a-zA-Z][a-zA-Z0-9_-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;

  while ((m = attrRegex.exec(attrString)) !== null) {
    const name = m[1].toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) continue;

    const value = m[2] ?? m[3] ?? m[4];
    if (value !== undefined) {
      // Sanitize attribute values: block javascript: URLs
      if ((name === 'href' || name === 'src') && /^\s*javascript\s*:/i.test(value)) {
        continue;
      }
      attrs.push(` ${name}="${escapeAttr(value)}"`);
    } else {
      // Boolean attribute (e.g., checked, disabled)
      attrs.push(` ${name}`);
    }
  }

  return attrs.join('');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
