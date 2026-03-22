/**
 * DOMPurify-based sanitizer for Node.js (server/Fastify).
 */

import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { ALLOWED_TAGS, ALLOWED_ATTRS } from './render.js';
import type { Sanitizer } from './render.js';

const window = new JSDOM('').window;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const purify = DOMPurify(window as any);

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [...ALLOWED_TAGS],
  ALLOWED_ATTR: [...ALLOWED_ATTRS],
  ALLOW_DATA_ATTR: false,
};

export const sanitize: Sanitizer = (html: string) =>
  purify.sanitize(html, PURIFY_CONFIG);
