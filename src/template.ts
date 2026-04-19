/**
 * HTML page template for rendered markdown pages.
 * Features: dark/light mode, styled tables, countdown timer, burn button.
 */

import { MARKED_INLINE_JS } from './marked-inline.js';

export function pageTemplate(opts: {
  html: string;
  slug: string;
  expiresAt: number; // 0 = permanent
  baseUrl: string;
  showAdBanner?: boolean;
}): string {
  const { html, slug, expiresAt, baseUrl, showAdBanner = false } = opts;
  const isPermanent = expiresAt === 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>peekmd</title>
<style>
/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Theme variables */
:root {
  --bg: #ffffff;
  --fg: #1a1a2e;
  --fg-muted: #6b7280;
  --border: #e5e7eb;
  --code-bg: #f3f4f6;
  --pre-bg: #1e1e2e;
  --pre-fg: #cdd6f4;
  --link: #2563eb;
  --accent: #ef4444;
  --table-stripe: #f9fafb;
  --bar-bg: #e5e7eb;
  --bar-fg: #3b82f6;
  --blockquote-border: #d1d5db;
  --blockquote-bg: #f9fafb;
}

[data-theme="dark"] {
  --bg: #1a1a2e;
  --fg: #e2e8f0;
  --fg-muted: #94a3b8;
  --border: #334155;
  --code-bg: #2d2d44;
  --pre-bg: #11111b;
  --pre-fg: #cdd6f4;
  --link: #60a5fa;
  --accent: #f87171;
  --table-stripe: #1e293b;
  --bar-bg: #334155;
  --bar-fg: #60a5fa;
  --blockquote-border: #475569;
  --blockquote-bg: #1e293b;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.7;
  padding: 0;
  min-height: 100vh;
  transition: background 0.2s, color 0.2s;
}

/* Top bar */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--fg-muted);
  gap: 12px;
  flex-wrap: wrap;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand {
  font-weight: 700;
  font-size: 15px;
  color: var(--fg);
  text-decoration: none;
}
.countdown {
  font-variant-numeric: tabular-nums;
}
.progress-bar {
  width: 80px;
  height: 4px;
  background: var(--bar-bg);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--bar-fg);
  border-radius: 2px;
  transition: width 1s linear;
}

/* Buttons */
.btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg-muted);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.btn:hover { color: var(--fg); border-color: var(--fg-muted); }
.btn-burn {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-burn:hover {
  background: var(--accent);
  color: white;
}

/* Content */
.content {
  max-width: 780px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

/* Typography */
.content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.3;
}
.content h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
.content h2 { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
.content h3 { font-size: 1.25em; }
.content p { margin: 0.8em 0; }
.content a { color: var(--link); text-decoration: none; }
.content a:hover { text-decoration: underline; }
.content img { max-width: 100%; border-radius: 8px; }
.content hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }

/* Lists */
.content ul, .content ol { padding-left: 2em; margin: 0.8em 0; }
.content li { margin: 0.25em 0; }
.content li > ul, .content li > ol { margin: 0; }

/* Blockquotes */
.content blockquote {
  border-left: 4px solid var(--blockquote-border);
  background: var(--blockquote-bg);
  padding: 12px 16px;
  margin: 1em 0;
  border-radius: 0 8px 8px 0;
}
.content blockquote p { margin: 0.3em 0; }

/* Code */
.content code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
}
.content pre {
  background: var(--pre-bg);
  color: var(--pre-fg);
  padding: 16px 20px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
  line-height: 1.5;
}
.content pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 0.85em;
  color: inherit;
}

/* Tables */
.table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 1em 0;
}
.content table {
  border-collapse: collapse;
  width: 100%;
  min-width: 400px;
}
.content th, .content td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}
.content th {
  font-weight: 600;
  background: var(--code-bg);
}
.content tr:nth-child(even) td {
  background: var(--table-stripe);
}

/* Task lists */
.content input[type="checkbox"] {
  margin-right: 6px;
}

/* Expired state */
.expired .content { opacity: 0.4; }
.expired-banner {
  text-align: center;
  padding: 40px 24px;
  color: var(--fg-muted);
  font-size: 1.1em;
}

/* Ad banner placeholder (free tier) */
.ad-banner {
  margin-top: 3em;
  padding: 24px;
  border: 2px dashed var(--border);
  border-radius: 10px;
  text-align: center;
  background: var(--table-stripe);
  color: var(--fg-muted);
  font-size: 13px;
  line-height: 1.6;
}
.ad-banner .ad-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  opacity: 0.6;
}
.ad-banner a {
  color: var(--link);
  text-decoration: none;
  font-weight: 600;
}
.ad-banner a:hover { text-decoration: underline; }

/* highlight.js theme overrides (Catppuccin-style) */
.hljs-keyword { color: #cba6f7; }
.hljs-string { color: #a6e3a1; }
.hljs-number { color: #fab387; }
.hljs-comment { color: #6c7086; font-style: italic; }
.hljs-function { color: #89b4fa; }
.hljs-title { color: #89b4fa; }
.hljs-built_in { color: #f38ba8; }
.hljs-type { color: #f9e2af; }
.hljs-attr { color: #89dceb; }
.hljs-variable { color: #cdd6f4; }
.hljs-operator { color: #89dceb; }
.hljs-punctuation { color: #9399b2; }
.hljs-meta { color: #f5c2e7; }
.hljs-selector-class { color: #a6e3a1; }
.hljs-selector-id { color: #fab387; }
.hljs-literal { color: #fab387; }
.hljs-params { color: #f2cdcd; }

/* Mobile responsiveness for rendered pages */
@media (max-width: 480px) {
  .topbar { padding: 10px 16px; font-size: 12px; }
  .topbar-left { gap: 10px; }
  .brand { font-size: 14px; }
  .progress-bar { width: 60px; }
  .content { padding: 24px 16px 60px; }
  .content h1 { font-size: 1.6em; }
  .content h2 { font-size: 1.3em; }
  .content pre { padding: 12px 14px; font-size: 0.8em; }
  .content table { min-width: 280px; }
  .ad-banner { padding: 16px; font-size: 12px; }
}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-left">
    <span class="brand">peekmd</span>
    <span class="countdown" id="countdown">--:--</span>
    <div class="progress-bar"><div class="progress-bar-fill" id="progress"></div></div>
  </div>
  <div class="topbar-right">
    <button class="btn" id="theme-toggle" title="Toggle theme">dark</button>
    <button class="btn btn-burn" id="burn-btn" title="Delete this page permanently">burn</button>
  </div>
</div>

<div class="content" id="content">
${html}
${showAdBanner ? `
<div class="ad-banner">
  <span class="ad-label">Advertisement</span>
  Shared with <a href="https://peekmd.com">peekmd</a> &mdash; beautiful markdown, one link away.
  <a href="${baseUrl}/api/pricing">Upgrade to remove ads</a>
</div>
` : ''}
</div>

<script>
(function() {
  // Theme
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const saved = localStorage.getItem('peekmd-theme');
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  const toggleBtn = document.getElementById('theme-toggle');
  toggleBtn.textContent = theme === 'dark' ? 'light' : 'dark';
  toggleBtn.addEventListener('click', function() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    toggleBtn.textContent = next === 'dark' ? 'light' : 'dark';
    localStorage.setItem('peekmd-theme', next);
  });

  // Wrap tables for horizontal scroll
  document.querySelectorAll('.content table').forEach(function(table) {
    if (!table.parentElement.classList.contains('table-wrap')) {
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
  });

  // Countdown timer
  var expiresAt = ${expiresAt};
  var countdownEl = document.getElementById('countdown');
  var progressEl = document.getElementById('progress');

  if (expiresAt === 0) {
    // Permanent page — no countdown
    countdownEl.textContent = 'permanent';
    progressEl.style.width = '100%';
  } else {
    var createdNow = Date.now();
    var totalDuration = expiresAt - createdNow;

    function updateCountdown() {
      var remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        countdownEl.textContent = 'expired';
        progressEl.style.width = '0%';
        document.body.classList.add('expired');
        return;
      }
      var pct = Math.max(0, (remaining / totalDuration) * 100);
      progressEl.style.width = pct + '%';

      var secs = Math.floor(remaining / 1000);
      var mins = Math.floor(secs / 60);
      var hrs = Math.floor(mins / 60);
      secs = secs % 60;
      mins = mins % 60;

      if (hrs > 0) {
        countdownEl.textContent = hrs + 'h ' + mins + 'm ' + secs + 's';
      } else if (mins > 0) {
        countdownEl.textContent = mins + 'm ' + secs + 's';
      } else {
        countdownEl.textContent = secs + 's';
      }
      requestAnimationFrame(updateCountdown);
    }
    updateCountdown();
  }

  // Burn button
  document.getElementById('burn-btn').addEventListener('click', function() {
    if (!confirm('Permanently delete this page? This cannot be undone.')) return;
    fetch('${baseUrl}/api/burn/${slug}', { method: 'POST' })
      .then(function(res) {
        if (res.ok) {
          document.body.classList.add('expired');
          countdownEl.textContent = 'burned';
          progressEl.style.width = '0%';
          document.getElementById('content').innerHTML = '<div class="expired-banner">This page has been burned.</div>';
        }
      });
  });
})();
</script>
</body>
</html>`;
}

export function challengeTemplate(opts: {
  html: string;
  slug: string;
  expiresAt: number;
  baseUrl: string;
  keeperCount: number;
  viewCount: number;
  createdAt: number;
  extendSec: number;
}): string {
  const { html, slug, expiresAt, baseUrl, keeperCount, viewCount, createdAt, extendSec } = opts;
  const ttlLabel = extendSec >= 3600 ? Math.floor(extendSec / 3600) + 'h' : Math.floor(extendSec / 60) + 'm';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>🔥 Keep Alive Challenge — peekmd</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root { --bg: #ffffff; --fg: #1a1a2e; --fg-muted: #6c7086; --border: #e0e0e0; --link: #1e90ff; --table-stripe: #f5f5f5; }
[data-theme="dark"] { --bg: #1e1e2e; --fg: #cdd6f4; --fg-muted: #6c7086; --border: #313244; --link: #89b4fa; --table-stripe: #181825; }
html { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); }
.topbar { position: sticky; top: 0; z-index: 100; display: flex; justify-content: space-between; align-items: center; padding: 10px 24px; background: var(--bg); border-bottom: 1px solid var(--border); font-size: 13px; }
.topbar-left { display: flex; align-items: center; gap: 16px; }
.brand { font-weight: 700; font-size: 16px; }
.countdown { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--link); }
.progress-bar { width: 80px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.progress-bar-fill { height: 100%; background: var(--link); transition: width 0.3s; }
.btn { background: none; border: 1px solid var(--border); color: var(--fg); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.challenge-banner { text-align: center; padding: 24px; background: linear-gradient(135deg, #f97316, #ef4444); color: white; }
.challenge-banner h2 { font-size: 1.4em; margin-bottom: 8px; }
.challenge-stats { display: flex; justify-content: center; gap: 32px; margin-top: 12px; font-size: 0.95em; }
.challenge-stats .stat { text-align: center; }
.challenge-stats .stat-value { font-size: 1.8em; font-weight: 800; display: block; }
.challenge-stats .stat-label { font-size: 0.75em; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.05em; }
.challenge-share { margin-top: 16px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.challenge-share a, .challenge-share button { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; text-decoration: none; }
.challenge-share a:hover, .challenge-share button:hover { background: rgba(255,255,255,0.35); }
.challenge-share svg { width: 18px; height: 18px; fill: currentColor; }
.content { max-width: 800px; margin: 0 auto; padding: 32px 24px 60px; line-height: 1.7; }
.content h1, .content h2, .content h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
.content p { margin-bottom: 1em; }
.content pre { background: var(--table-stripe); padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 0.85em; }
.content code { font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; }
.content a { color: var(--link); }
.content table { width: 100%; border-collapse: collapse; margin: 1em 0; }
.content th, .content td { padding: 8px 12px; border: 1px solid var(--border); text-align: left; }
.content tr:nth-child(even) { background: var(--table-stripe); }
@media (max-width: 480px) {
  .challenge-stats { gap: 16px; }
  .challenge-stats .stat-value { font-size: 1.4em; }
  .content { padding: 24px 16px 60px; }
}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-left">
    <span class="brand">peekmd</span>
    <span class="countdown" id="countdown">--:--</span>
    <div class="progress-bar"><div class="progress-bar-fill" id="progress"></div></div>
  </div>
  <div class="topbar-right">
    <button class="btn" id="theme-toggle" title="Toggle theme">dark</button>
  </div>
</div>
<div class="challenge-banner">
  <h2>🔥 Keep Alive Challenge</h2>
  <p>Each unique visitor adds <strong>${ttlLabel}</strong> to this page's life. Share the link!</p>
  <div class="challenge-stats">
    <div class="stat"><span class="stat-value">${keeperCount}</span><span class="stat-label">Keepers</span></div>
    <div class="stat"><span class="stat-value">${viewCount}</span><span class="stat-label">Views</span></div>
    <div class="stat"><span class="stat-value">+${ttlLabel}</span><span class="stat-label">Per Visit</span></div>
    <div class="stat"><span class="stat-value" id="created-ago"></span><span class="stat-label">Created</span></div>
  </div>
  <div class="challenge-share" id="share-btns">
    <a id="share-x" target="_blank" rel="noopener" title="Share on X"><svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>X</a>
    <a id="share-threads" target="_blank" rel="noopener" title="Share on Threads"><svg viewBox="0 0 24 24"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.781 3.632 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.343-.783-.99-1.42-1.834-1.856.026-.327.037-.663.03-1.007-.03-1.49-.332-2.755-.899-3.763-.546-.97-1.33-1.696-2.332-2.159-1.06-.49-2.32-.737-3.746-.737-2.07 0-3.706.553-4.864 1.643-1.2 1.13-1.835 2.726-1.889 4.744l2.119.037c.04-1.468.47-2.573 1.279-3.283.78-.685 1.9-1.022 3.355-1.022 1.1 0 2.05.18 2.828.535.7.32 1.23.78 1.575 1.368.36.614.56 1.432.583 2.584-1.14-.175-2.35-.237-3.6-.183-1.69.073-3.15.46-4.342 1.15-1.28.74-2.17 1.8-2.648 3.148-.24.678-.36 1.395-.36 2.14 0 1.573.614 2.95 1.728 3.872 1.072.886 2.48 1.335 4.188 1.335 1.678 0 3.148-.467 4.365-1.388 1.04-.787 1.79-1.848 2.236-3.16.61.653.96 1.47 1.072 2.464.18 1.606-.36 3.2-1.567 4.624C18.07 22.88 15.636 23.98 12.186 24zm.088-5.412c-1.2 0-2.148-.32-2.822-.953-.627-.588-.944-1.37-.944-2.326 0-.442.068-.86.203-1.24.31-.876.95-1.573 1.903-2.073.88-.462 2.026-.71 3.41-.737 1.19-.027 2.34.04 3.43.2-.09 1.645-.527 2.97-1.3 3.94-.87 1.09-2.1 1.643-3.66 1.643-.073 0-.147-.002-.22-.006z"/></svg>Threads</a>
    <a id="share-fb" target="_blank" rel="noopener" title="Share on Facebook"><svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Facebook</a>
    <button id="share-ig" title="Copy link for Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>Instagram</button>
    <button onclick="navigator.clipboard.writeText(window.location.href).then(function(){this.textContent='✓ Copied'}.bind(this))" title="Copy link">📋 Copy</button>
  </div>
</div>
<div class="content">${html}</div>
<script>
(function() {
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var saved = localStorage.getItem('peekmd-theme');
  var theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  var toggleBtn = document.getElementById('theme-toggle');
  toggleBtn.textContent = theme === 'dark' ? 'light' : 'dark';
  toggleBtn.addEventListener('click', function() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    toggleBtn.textContent = next === 'dark' ? 'light' : 'dark';
    localStorage.setItem('peekmd-theme', next);
  });

  // Share URLs
  var url = encodeURIComponent(window.location.href);
  var text = encodeURIComponent('🔥 Can you help keep this page alive? Every visit extends its life!');
  document.getElementById('share-x').href = 'https://x.com/intent/tweet?text=' + text + '&url=' + url;
  document.getElementById('share-threads').href = 'https://threads.net/intent/post?text=' + text + ' ' + url;
  document.getElementById('share-fb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + url;
  document.getElementById('share-ig').addEventListener('click', function() {
    var caption = decodeURIComponent(text) + ' ' + decodeURIComponent(url);
    navigator.clipboard.writeText(caption).then(function() {
      document.getElementById('share-ig').innerHTML = '✓ Copied for IG';
      setTimeout(function() { document.getElementById('share-ig').innerHTML = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>Instagram'; }, 2000);
    });
  });

  // Created ago
  var created = ${createdAt};
  function ago() {
    var d = Date.now() - created;
    var s = Math.floor(d/1000), m = Math.floor(s/60), h = Math.floor(m/60), dy = Math.floor(h/24);
    if (dy > 0) return dy + 'd ' + (h%24) + 'h';
    if (h > 0) return h + 'h ' + (m%60) + 'm';
    if (m > 0) return m + 'm';
    return s + 's';
  }
  var agoEl = document.getElementById('created-ago');
  function updateAgo() { agoEl.textContent = ago(); }
  updateAgo();
  setInterval(updateAgo, 60000);

  // Countdown
  var expiresAt = ${expiresAt};
  var countdownEl = document.getElementById('countdown');
  var progressEl = document.getElementById('progress');
  var totalDuration = expiresAt > 0 ? expiresAt - Date.now() : 0;
  if (expiresAt === 0) {
    countdownEl.textContent = 'permanent';
    progressEl.style.width = '100%';
  } else {
    function updateCountdown() {
      var remaining = expiresAt - Date.now();
      if (remaining <= 0) { countdownEl.textContent = 'expired'; progressEl.style.width = '0%'; return; }
      progressEl.style.width = Math.max(0, (remaining / totalDuration) * 100) + '%';
      var secs = Math.floor(remaining/1000), mins = Math.floor(secs/60), hrs = Math.floor(mins/60);
      secs %= 60; mins %= 60;
      countdownEl.textContent = hrs > 0 ? hrs+'h '+mins+'m '+secs+'s' : mins > 0 ? mins+'m '+secs+'s' : secs+'s';
      requestAnimationFrame(updateCountdown);
    }
    updateCountdown();
  }

  // Live poll for challenge stats
  var keeperEl = document.querySelectorAll('.stat-value')[0];
  var viewEl = document.querySelectorAll('.stat-value')[1];
  setInterval(function() {
    fetch('${baseUrl}/api/challenge/${slug}')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) {
        if (!d) return;
        keeperEl.textContent = d.keeperCount;
        viewEl.textContent = d.viewCount;
        if (d.expiresAt > 0 && d.expiresAt !== expiresAt) {
          expiresAt = d.expiresAt;
          totalDuration = expiresAt - Date.now();
        }
      })
      .catch(function() {});
  }, 15000);
})();
</script>
</body>
</html>`;
}

export function challengeCreateTemplate(opts: { baseUrl: string }): string {
  const { baseUrl } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>🔥 Create a Challenge — peekmd</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root { --bg: #ffffff; --fg: #1a1a2e; --fg-muted: #6c7086; --border: #e0e0e0; --link: #2563eb; --table-stripe: #f5f5f5; --accent: #f97316; --code-bg: #f3f4f6; --pre-bg: #1e1e2e; --pre-fg: #cdd6f4; --blockquote-border: #d1d5db; --blockquote-bg: #f9fafb; }
[data-theme="dark"] { --bg: #1e1e2e; --fg: #cdd6f4; --fg-muted: #6c7086; --border: #313244; --link: #89b4fa; --table-stripe: #181825; --accent: #fab387; --code-bg: #2d2d44; --pre-bg: #11111b; --pre-fg: #cdd6f4; --blockquote-border: #475569; --blockquote-bg: #1e293b; }
html { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); }
body { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.brand { font-weight: 700; font-size: 18px; text-decoration: none; color: var(--fg); }
.btn { background: none; border: 1px solid var(--border); color: var(--fg); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
h1 { font-size: 1.6em; margin-bottom: 8px; }
.subtitle { color: var(--fg-muted); margin-bottom: 24px; }
label { display: block; font-weight: 600; margin-bottom: 6px; margin-top: 16px; }
textarea { width: 100%; height: 100%; min-height: 300px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--table-stripe); color: var(--fg); font-family: 'SF Mono', Consolas, monospace; font-size: 14px; resize: none; }
select, input[type="text"] { padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--table-stripe); color: var(--fg); font-size: 14px; }
.form-row { display: flex; gap: 16px; align-items: end; flex-wrap: wrap; }
.editor-wrap { display: flex; gap: 16px; margin-top: 16px; }
.editor-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pane-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.pane-header label { margin: 0; }
.char-count { font-size: 12px; color: var(--fg-muted); }
.char-count.warn { color: #f59e0b; }
.char-count.over { color: #dc2626; }
.preview-pane { flex: 1; min-width: 0; }
.preview-box { border: 1px solid var(--border); border-radius: 8px; padding: 20px 24px; min-height: 300px; overflow-y: auto; max-height: 70vh; line-height: 1.7; }
.preview-box:empty::before { content: 'Preview will appear here...'; color: var(--fg-muted); font-style: italic; }
.preview-box h1, .preview-box h2, .preview-box h3, .preview-box h4, .preview-box h5, .preview-box h6 { margin-top: 1.2em; margin-bottom: 0.4em; font-weight: 600; line-height: 1.3; }
.preview-box h1:first-child, .preview-box h2:first-child, .preview-box h3:first-child { margin-top: 0; }
.preview-box h1 { font-size: 1.8em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
.preview-box h2 { font-size: 1.4em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
.preview-box h3 { font-size: 1.2em; }
.preview-box p { margin: 0.7em 0; }
.preview-box a { color: var(--link); text-decoration: none; }
.preview-box img { max-width: 100%; border-radius: 8px; }
.preview-box hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
.preview-box ul, .preview-box ol { padding-left: 2em; margin: 0.7em 0; }
.preview-box li { margin: 0.2em 0; }
.preview-box blockquote { border-left: 4px solid var(--blockquote-border); background: var(--blockquote-bg); padding: 10px 14px; margin: 0.8em 0; border-radius: 0 8px 8px 0; }
.preview-box blockquote p { margin: 0.2em 0; }
.preview-box code { background: var(--code-bg); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: 'SF Mono', Consolas, monospace; }
.preview-box pre { background: var(--pre-bg); color: var(--pre-fg); padding: 14px 18px; border-radius: 8px; overflow-x: auto; margin: 0.8em 0; line-height: 1.5; }
.preview-box pre code { background: none; padding: 0; border-radius: 0; font-size: 0.85em; color: inherit; }
.preview-box table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
.preview-box th, .preview-box td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
.preview-box th { font-weight: 600; background: var(--code-bg); }
.preview-box tr:nth-child(even) td { background: var(--table-stripe); }
.preview-box del { text-decoration: line-through; }
@media (max-width: 768px) { .editor-wrap { flex-direction: column; } .preview-box { max-height: 50vh; } }
.create-btn { margin-top: 24px; padding: 12px 32px; background: linear-gradient(135deg, #f97316, #ef4444); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; width: 100%; }
.create-btn:hover { opacity: 0.9; }
.create-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.result { margin-top: 24px; padding: 20px; border: 2px solid var(--accent); border-radius: 8px; display: none; }
.result h3 { margin-bottom: 8px; }
.result a { color: var(--link); word-break: break-all; }
.result .share-row { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.result .share-row a, .result .share-row button { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; text-decoration: none; color: var(--fg); background: var(--table-stripe); cursor: pointer; }
.error { margin-top: 16px; padding: 12px; background: #fef2f2; color: #dc2626; border-radius: 8px; display: none; }
[data-theme="dark"] .error { background: #2d1b1b; color: #fca5a5; }
.api-key-field { width: 100%; }
</style>
</head>
<body>
<div class="topbar">
  <a class="brand" href="${baseUrl}/">peekmd</a>
  <button class="btn" id="theme-toggle">dark</button>
</div>
<h1>🔥 Create a Challenge</h1>
<p class="subtitle">Write your content in markdown. Visitors will keep your page alive by visiting it!</p>

<label for="api-key">API Key</label>
<input type="text" id="api-key" class="api-key-field" placeholder="sk_..." />

<div class="editor-wrap">
  <div class="editor-pane">
    <div class="pane-header">
      <label for="markdown">Markdown</label>
      <span class="char-count" id="char-count">0 / 500 KB</span>
    </div>
    <textarea id="markdown" placeholder="# My Challenge Page\n\nShare this page and keep it alive!"></textarea>
  </div>
  <div class="preview-pane">
    <div class="pane-header">
      <label>Preview</label>
    </div>
    <div class="preview-box" id="preview"></div>
  </div>
</div>

<div class="form-row">
  <div>
    <label for="ttl">Initial TTL</label>
    <select id="ttl">
      <option value="300">5 minutes</option>
      <option value="600">10 minutes</option>
      <option value="1800" selected>30 minutes</option>
      <option value="3600">1 hour</option>
    </select>
  </div>
</div>

<button class="create-btn" id="create-btn">🔥 Create Challenge</button>
<div class="error" id="error"></div>
<div class="result" id="result">
  <h3>🎉 Challenge created!</h3>
  <p>Share this link: <a id="result-link" href="#" target="_blank"></a></p>
  <p style="color:var(--fg-muted);font-size:13px;margin-top:4px;">Every unique visitor extends the page's life. See all challenges on the <a href="${baseUrl}/challenges">leaderboard</a>.</p>
  <div class="share-row">
    <a id="result-x" target="_blank" rel="noopener">𝕏 Post</a>
    <a id="result-threads" target="_blank" rel="noopener">Threads</a>
    <a id="result-fb" target="_blank" rel="noopener">Facebook</a>
    <button id="result-ig">Instagram</button>
    <button id="result-copy">📋 Copy</button>
  </div>
</div>

<script>${MARKED_INLINE_JS}</script>
<script>
(function() {
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var saved = localStorage.getItem('peekmd-theme');
  var theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  var toggleBtn = document.getElementById('theme-toggle');
  toggleBtn.textContent = theme === 'dark' ? 'light' : 'dark';
  toggleBtn.addEventListener('click', function() {
    var c = document.documentElement.getAttribute('data-theme');
    var n = c === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    toggleBtn.textContent = n === 'dark' ? 'light' : 'dark';
    localStorage.setItem('peekmd-theme', n);
  });

  // Pre-fill API key from URL param
  var params = new URLSearchParams(window.location.search);
  var keyParam = params.get('key');
  if (keyParam) document.getElementById('api-key').value = keyParam;

  // ── Live markdown preview via inlined marked.js ──
  var MAX_BYTES = 512000;
  marked.setOptions({ gfm: true, breaks: false });
  var mdEl = document.getElementById('markdown');
  var previewEl = document.getElementById('preview');
  var charCountEl = document.getElementById('char-count');
  var debounceTimer;
  function updatePreview() {
    var val = mdEl.value;
    var bytes = new Blob([val]).size;
    var kb = (bytes / 1024).toFixed(1);
    charCountEl.textContent = kb + ' KB / 500 KB';
    charCountEl.className = 'char-count' + (bytes > MAX_BYTES ? ' over' : bytes > MAX_BYTES * 0.9 ? ' warn' : '');
    previewEl.innerHTML = val.trim() ? marked.parse(val) : '';
  }
  mdEl.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updatePreview, 150);
  });

  document.getElementById('create-btn').addEventListener('click', function() {
    var btn = this;
    var md = document.getElementById('markdown').value.trim();
    var ttl = parseInt(document.getElementById('ttl').value);
    var key = document.getElementById('api-key').value.trim();
    var errEl = document.getElementById('error');
    var resEl = document.getElementById('result');
    errEl.style.display = 'none';
    resEl.style.display = 'none';

    if (!key) { errEl.textContent = 'API key is required.'; errEl.style.display = 'block'; return; }
    if (!md) { errEl.textContent = 'Markdown content is required.'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    fetch('${baseUrl}/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ markdown: md, ttl: ttl, challenge: true })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      btn.disabled = false;
      btn.textContent = '🔥 Create Challenge';
      if (!res.ok) {
        errEl.textContent = res.data.message || res.data.error || 'Failed to create challenge.';
        errEl.style.display = 'block';
        return;
      }
      var url = res.data.url;
      var link = document.getElementById('result-link');
      link.href = url;
      link.textContent = url;
      var enc = encodeURIComponent(url);
      var text = encodeURIComponent('🔥 Can you help keep this page alive? Every visit extends its life!');
      document.getElementById('result-x').href = 'https://x.com/intent/tweet?text=' + text + '&url=' + enc;
      document.getElementById('result-threads').href = 'https://threads.net/intent/post?text=' + text + ' ' + enc;
      document.getElementById('result-fb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + enc;
      document.getElementById('result-ig').onclick = function() {
        var caption = decodeURIComponent(text) + ' ' + url;
        navigator.clipboard.writeText(caption).then(function() { this.textContent = '✓ Copied for IG'; setTimeout(function() { this.textContent = 'Instagram'; }.bind(this), 2000); }.bind(this));
      };
      document.getElementById('result-copy').onclick = function() {
        navigator.clipboard.writeText(url).then(function() { this.textContent = '✓ Copied'; }.bind(this));
      };
      resEl.style.display = 'block';
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = '🔥 Create Challenge';
      errEl.textContent = 'Network error. Please try again.';
      errEl.style.display = 'block';
    });
  });
})();
</script>
</body>
</html>`;
}

export function challengeListTemplate(opts: {
  challenges: { slug: string; meta: { keeperCount: number; viewCount: number; createdAt: number; extendSec: number }; expiresAt: number }[];
  baseUrl: string;
}): string {
  const { challenges, baseUrl } = opts;
  const rows = challenges.map((c, i) => {
    const ago = Date.now() - c.meta.createdAt;
    const days = Math.floor(ago / 86_400_000);
    const hours = Math.floor((ago % 86_400_000) / 3_600_000);
    const ageStr = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    const status = c.expiresAt === 0 ? 'permanent' : c.expiresAt > Date.now() ? '🟢 alive' : '💀 expired';
    const ttl = c.meta.extendSec >= 3600 ? Math.floor(c.meta.extendSec / 3600) + 'h' : Math.floor(c.meta.extendSec / 60) + 'm';
    return `<tr>
      <td>${i + 1}</td>
      <td><a href="${baseUrl}/${c.slug}">${c.slug}</a></td>
      <td>+${ttl}</td>
      <td><strong>${c.meta.keeperCount}</strong></td>
      <td>${c.meta.viewCount}</td>
      <td>${ageStr}</td>
      <td>${status}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>🔥 Challenge Leaderboard — peekmd</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root { --bg: #ffffff; --fg: #1a1a2e; --fg-muted: #6c7086; --border: #e0e0e0; --link: #1e90ff; --table-stripe: #f5f5f5; --accent: #f97316; }
[data-theme="dark"] { --bg: #1e1e2e; --fg: #cdd6f4; --fg-muted: #6c7086; --border: #313244; --link: #89b4fa; --table-stripe: #181825; --accent: #fab387; }
html { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); }
body { max-width: 800px; margin: 0 auto; padding: 32px 24px; }
.header { text-align: center; margin-bottom: 32px; }
.header h1 { font-size: 1.8em; margin-bottom: 8px; }
.header p { color: var(--fg-muted); }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.brand { font-weight: 700; font-size: 18px; text-decoration: none; color: var(--fg); }
.btn { background: none; border: 1px solid var(--border); color: var(--fg); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); }
th { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-muted); }
tr:hover { background: var(--table-stripe); }
td a { color: var(--link); text-decoration: none; font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; }
td a:hover { text-decoration: underline; }
td strong { color: var(--accent); font-size: 1.1em; }
.empty { text-align: center; padding: 60px 24px; color: var(--fg-muted); }
.empty p { margin-top: 12px; }
@media (max-width: 480px) { th, td { padding: 8px 8px; font-size: 0.85em; } }
</style>
</head>
<body>
<div class="topbar">
  <a class="brand" href="${baseUrl}/">peekmd</a>
  <button class="btn" id="theme-toggle">dark</button>
</div>
<div class="header">
  <h1>🔥 Challenge Leaderboard</h1>
  <p>Pages kept alive by the community. Visit a page to help keep it going!</p>
</div>
${challenges.length > 0 ? `
<table>
  <thead><tr><th>#</th><th>Page</th><th>Difficulty</th><th>Keepers</th><th>Views</th><th>Age</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
` : `
<div class="empty">
  <p>🏜️ No active challenges yet.</p>
  <p>Create one with <code>{"challenge": true}</code> in your API request.</p>
</div>
`}
<script>
(function() {
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var saved = localStorage.getItem('peekmd-theme');
  var theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  var btn = document.getElementById('theme-toggle');
  btn.textContent = theme === 'dark' ? 'light' : 'dark';
  btn.addEventListener('click', function() {
    var c = document.documentElement.getAttribute('data-theme');
    var n = c === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    btn.textContent = n === 'dark' ? 'light' : 'dark';
    localStorage.setItem('peekmd-theme', n);
  });
})();
</script>
</body>
</html>`;
}

export function landingTemplate(baseUrl: string): string {
  const description = 'POST markdown to an API, get a shareable link to a beautifully rendered page. Built for AI agents, bots, and developers who need to share rich content instantly.';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>peekmd — Share beautifully rendered markdown via API</title>
<meta name="description" content="${description}">
<meta name="keywords" content="markdown, API, share, render, AI agents, developer tools, syntax highlighting, temporary pages">
<link rel="canonical" href="${baseUrl}/">
<meta property="og:type" content="website">
<meta property="og:title" content="peekmd — Share beautifully rendered markdown via API">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${baseUrl}/">
<meta property="og:image" content="${baseUrl}/og-image.svg">
<meta property="og:image:type" content="image/svg+xml">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="peekmd — Share beautifully rendered markdown via API">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${baseUrl}/og-image.svg">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "peekmd",
  "description": "POST markdown to an API, get a shareable link to a beautifully rendered page.",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "url": "${baseUrl}"
}
</script>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { overflow-x: hidden; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e; color: #e2e8f0; min-height: 100vh;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px 24px; overflow-x: hidden;
}
.hero { text-align: center; max-width: 640px; width: 100%; }
h1 { font-size: 2.5em; font-weight: 700; margin-bottom: 0.2em; }
h1 span { color: #60a5fa; }
.tagline { font-size: 1.3em; color: #e2e8f0; margin-bottom: 0.5em; font-weight: 500; }
.problem { font-size: 1em; color: #94a3b8; margin-bottom: 2em; line-height: 1.6; max-width: 520px; margin-left: auto; margin-right: auto; }
.problem strong { color: #e2e8f0; }
h2 { font-size: 1.1em; color: #94a3b8; font-weight: 600; margin-bottom: 1em; text-transform: uppercase; letter-spacing: 0.05em; }
pre {
  background: #11111b; color: #cdd6f4; padding: 20px 24px; border-radius: 10px;
  text-align: left; overflow-x: auto; font-size: 0.85em; line-height: 1.6;
  font-family: 'SF Mono', 'Fira Code', monospace; margin-bottom: 1.5em; width: 100%;
}
.comment { color: #6c7086; }
.string { color: #a6e3a1; }
.key { color: #89b4fa; }
.info { color: #94a3b8; font-size: 0.9em; }
.info a { color: #60a5fa; text-decoration: none; }
.info a:hover { text-decoration: underline; }
.features { display: flex; gap: 32px; margin-top: 2em; flex-wrap: wrap; justify-content: center; }
.feature { text-align: center; }
.feature dt { font-weight: 600; font-size: 0.95em; margin-bottom: 4px; }
.feature dd { color: #94a3b8; font-size: 0.85em; }
.demo-btn {
  display: inline-block; padding: 12px 28px;
  background: #60a5fa; color: #1a1a2e; font-weight: 600; font-size: 1em;
  border: none; border-radius: 8px; cursor: pointer; transition: background 0.15s;
  text-decoration: none;
}
.demo-btn:hover { background: #93c5fd; }
.demo-btn:disabled { opacity: 0.6; cursor: wait; }
.demo-result {
  margin-top: 1em; padding: 16px 20px; background: #11111b; border-radius: 8px;
  border: 1px solid #334155; display: none; text-align: center;
}
.demo-result p { color: #94a3b8; font-size: 0.9em; margin-bottom: 8px; }
.demo-result a {
  color: #60a5fa; font-weight: 600; font-size: 1em; text-decoration: none;
  word-break: break-all;
}
.demo-result a:hover { text-decoration: underline; }
.demo-result .demo-hint { font-size: 0.8em; color: #6c7086; margin-top: 8px; }
.use-cases { margin-top: 2.5em; text-align: left; width: 100%; }
.use-cases ul { list-style: none; padding: 0; }
.use-cases li { padding: 8px 0; color: #94a3b8; font-size: 0.95em; border-bottom: 1px solid #2d2d44; }
.use-cases li:last-child { border-bottom: none; }
.use-cases li strong { color: #e2e8f0; }

/* Pricing section */
.pricing { margin-top: 3em; width: 100%; }
.pricing h2 { text-align: center; }
.pricing-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  margin-top: 1.5em;
}
@media (max-width: 640px) { .pricing-grid { grid-template-columns: 1fr; } }
.plan-card {
  background: #11111b; border: 1px solid #334155; border-radius: 12px;
  padding: 24px 20px; text-align: center; display: flex; flex-direction: column;
}
.plan-card.featured { border-color: #60a5fa; }
.plan-name { font-weight: 700; font-size: 1.1em; color: #e2e8f0; margin-bottom: 4px; }
.plan-price { font-size: 1.8em; font-weight: 700; color: #60a5fa; margin: 8px 0 4px; }
.plan-price .period { font-size: 0.4em; color: #94a3b8; font-weight: 400; }
.plan-details { list-style: none; padding: 0; margin: 12px 0 20px; text-align: left; }
.plan-details li { padding: 4px 0; color: #94a3b8; font-size: 0.9em; }
.plan-details li::before { content: "\\2713 "; color: #60a5fa; font-weight: 700; }
.plan-cta {
  display: inline-block; margin-top: auto; padding: 10px 20px;
  border-radius: 8px; font-weight: 600; font-size: 0.95em;
  text-decoration: none; transition: background 0.15s;
}
.plan-cta-free { background: #334155; color: #e2e8f0; cursor: default; }
.plan-cta-paid { background: #60a5fa; color: #1a1a2e; }
.plan-cta-paid:hover { background: #93c5fd; }

/* GitHub star badge */
.gh-badge {
  display: inline-block; margin-top: 0.5em;
}
.gh-badge img { vertical-align: middle; }

/* How it works */
.how-it-works { margin-top: 2.5em; width: 100%; }
.how-it-works h2 { text-align: center; }
.steps {
  display: flex; gap: 24px; margin-top: 1.5em; justify-content: center; flex-wrap: wrap;
}
.step {
  flex: 1; min-width: 160px; max-width: 200px; text-align: center;
  background: #11111b; border: 1px solid #334155; border-radius: 12px; padding: 20px 16px;
}
.step-num {
  display: inline-block; width: 32px; height: 32px; line-height: 32px;
  background: #60a5fa; color: #1a1a2e; border-radius: 50%;
  font-weight: 700; font-size: 0.9em; margin-bottom: 8px;
}
.step-title { font-weight: 600; font-size: 1em; color: #e2e8f0; margin-bottom: 4px; }
.step-desc { font-size: 0.85em; color: #94a3b8; }
.step-arrow { display: flex; align-items: center; font-size: 1.5em; color: #475569; }
@media (max-width: 640px) { .step-arrow { display: none; } }

/* Code tabs */
.code-tabs { margin-bottom: 1.5em; width: 100%; }
.tab-bar {
  display: flex; gap: 0; border-bottom: 1px solid #334155; margin-bottom: 0;
}
.tab-btn {
  background: transparent; border: none; color: #94a3b8; padding: 8px 16px;
  cursor: pointer; font-size: 0.85em; font-weight: 500;
  border-bottom: 2px solid transparent; transition: color 0.15s, border-color 0.15s;
  font-family: inherit;
}
.tab-btn:hover { color: #e2e8f0; }
.tab-btn.active { color: #60a5fa; border-bottom-color: #60a5fa; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.tab-panel pre { border-radius: 0 0 10px 10px; margin-top: 0; }

/* Secondary CTA */
.cta-row { display: flex; gap: 12px; justify-content: center; align-items: center; margin-top: 2em; flex-wrap: wrap; }
.gh-cta {
  display: inline-block; padding: 12px 28px;
  background: transparent; color: #e2e8f0; font-weight: 600; font-size: 1em;
  border: 1px solid #475569; border-radius: 8px; cursor: pointer; transition: all 0.15s;
  text-decoration: none;
}
.gh-cta:hover { border-color: #94a3b8; color: #fff; }

/* Mobile responsiveness */
@media (max-width: 480px) {
  body { padding: 24px 16px; }
  h1 { font-size: 1.8em; }
  .tagline { font-size: 1.1em; }
  .problem { font-size: 0.9em; }
  h2 { font-size: 1em; }
  pre { padding: 14px 12px; font-size: 0.78em; }
  .tab-btn { padding: 6px 10px; font-size: 0.8em; }
  .features { gap: 16px; }
  .feature dt { font-size: 0.85em; }
  .feature dd { font-size: 0.78em; }
  .step { min-width: 120px; padding: 16px 12px; }
  .steps { gap: 12px; }
  .demo-btn, .gh-cta { padding: 10px 20px; font-size: 0.9em; }
  .plan-card { padding: 20px 16px; }
  .plan-price { font-size: 1.5em; }
  .info code { font-size: 0.75em; word-break: break-all; }
}
@media (max-width: 360px) {
  body { padding: 20px 12px; }
  h1 { font-size: 1.5em; }
  .tagline { font-size: 1em; }
  pre { padding: 12px 10px; font-size: 0.72em; }
  .features { flex-direction: column; gap: 12px; }
  .cta-row { flex-direction: column; }
  .demo-btn, .gh-cta { width: 100%; text-align: center; }
}
</style>
</head>
<body>
<div class="hero">
  <h1>peek<span>md</span></h1>
  <p class="tagline">Share beautifully rendered markdown via API.</p>
  <a class="gh-badge" href="https://github.com/notacryptodad/peekmd" target="_blank" rel="noopener"><img src="https://img.shields.io/github/stars/notacryptodad/peekmd?style=social" alt="GitHub stars"></a>
  <p class="problem">
    AI agents, bots, and scripts generate markdown — but <strong>Slack, Discord, and email mangle it</strong>.
    peekmd gives you a single API call to turn markdown into a <strong>shareable, beautifully rendered web page</strong>
    with syntax highlighting, dark mode, and auto-expiry.
  </p>

  <h2>One API call</h2>
  <div class="code-tabs">
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="bash">Bash</button>
      <button class="tab-btn" data-tab="python">Python</button>
      <button class="tab-btn" data-tab="javascript">JavaScript</button>
    </div>
    <div class="tab-panel active" data-tab="bash">
      <pre><span class="comment"># Post markdown, get a shareable link</span>
curl -X POST ${baseUrl}/api/create \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d '{<span class="key">"markdown"</span>: <span class="string">"# Hello\\nYour markdown here."</span>}'

<span class="comment"># Response:</span>
{ <span class="key">"url"</span>: <span class="string">"${baseUrl}/abc123"</span>, <span class="key">"slug"</span>: <span class="string">"abc123"</span> }</pre>
    </div>
    <div class="tab-panel" data-tab="python">
      <pre><span class="comment"># pip install requests</span>
<span class="key">import</span> requests

resp = requests.post(
    <span class="string">"${baseUrl}/api/create"</span>,
    json={<span class="string">"markdown"</span>: <span class="string">"# Hello\\nYour markdown here."</span>}
)
print(resp.json()[<span class="string">"url"</span>])
<span class="comment"># ${baseUrl}/abc123</span></pre>
    </div>
    <div class="tab-panel" data-tab="javascript">
      <pre><span class="key">const</span> resp = <span class="key">await</span> fetch(<span class="string">"${baseUrl}/api/create"</span>, {
  method: <span class="string">"POST"</span>,
  headers: { <span class="string">"Content-Type"</span>: <span class="string">"application/json"</span> },
  body: JSON.stringify({ markdown: <span class="string">"# Hello\\nYour markdown here."</span> })
});
<span class="key">const</span> { url } = <span class="key">await</span> resp.json();
console.log(url);
<span class="comment">// ${baseUrl}/abc123</span></pre>
    </div>
  </div>

  <div class="cta-row">
    <button class="demo-btn" id="demo-btn">View Demo</button>
    <a class="gh-cta" href="https://github.com/notacryptodad/peekmd" target="_blank" rel="noopener">View on GitHub</a>
  </div>
  <div class="demo-result" id="demo-result">
    <p>Your demo page (expires in 5 minutes):</p>
    <a id="demo-link" href="#" target="_blank" rel="noopener"></a>
    <p class="demo-hint">Opens in a new tab</p>
  </div>

  <div style="margin-top:1.5em">
    <p class="info">Free tier: 5-min TTL, no signup. <a href="#pricing">Subscribe</a> from $9/mo for longer TTL &amp; no ads.</p>
    <p class="info" style="margin-top:0.5em"><a href="https://clawhub.ai/notacryptodad/peekmd">Available on ClawHub</a> &mdash; <code style="background:#11111b;padding:4px 8px;border-radius:4px;font-size:0.85em;">clawhub install peekmd</code></p>
  </div>

  <dl class="features">
    <div class="feature"><dt>Syntax highlighting</dt><dd>190+ languages</dd></div>
    <div class="feature"><dt>Dark &amp; light mode</dt><dd>Auto-detected</dd></div>
    <div class="feature"><dt>Auto-expiring</dt><dd>5m to permanent</dd></div>
    <div class="feature"><dt>Burn after reading</dt><dd>One-click delete</dd></div>
  </dl>

  <div class="how-it-works">
    <h2>How it works</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-title">POST</div>
        <div class="step-desc">Send markdown to the API</div>
      </div>
      <div class="step-arrow">&rarr;</div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-title">URL</div>
        <div class="step-desc">Get a shareable link back</div>
      </div>
      <div class="step-arrow">&rarr;</div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-title">Share</div>
        <div class="step-desc">Anyone can view the rendered page</div>
      </div>
    </div>
  </div>

  <div class="pricing" id="pricing">
    <h2>Plans</h2>
    <div class="pricing-grid">
      <div class="plan-card">
        <div class="plan-name">Free</div>
        <div class="plan-price">$0<span class="period"></span></div>
        <ul class="plan-details">
          <li>5-minute page TTL</li>
          <li>Unlimited pages</li>
          <li>Syntax highlighting</li>
          <li>Ad banner on pages</li>
        </ul>
        <span class="plan-cta plan-cta-free">Current default</span>
      </div>
      <div class="plan-card">
        <div class="plan-name">Basic</div>
        <div class="plan-price">$9<span class="period"> /mo</span></div>
        <ul class="plan-details">
          <li>500 pages / month</li>
          <li>30-day page TTL</li>
          <li>No ads</li>
          <li>API key access</li>
        </ul>
        <button class="plan-cta plan-cta-paid" onclick="fetch('${baseUrl}/api/stripe/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:'basic'})}).then(r=>r.json()).then(d=>{if(d.url)window.location=d.url;else alert(d.message||d.error)}).catch(()=>alert('Checkout unavailable'))">Subscribe</button>
      </div>
      <div class="plan-card featured">
        <div class="plan-name">Pro</div>
        <div class="plan-price">$29<span class="period"> /mo</span></div>
        <ul class="plan-details">
          <li>5,000 pages / month</li>
          <li>Permanent page TTL*</li>
          <li>No ads</li>
          <li>API key access</li>
        </ul>
        <p style="font-size:0.75em;color:#888;margin:0.5em 0 0;">* Pages with no views for 90 days are automatically removed.</p>
        <button class="plan-cta plan-cta-paid" onclick="fetch('${baseUrl}/api/stripe/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:'pro'})}).then(r=>r.json()).then(d=>{if(d.url)window.location=d.url;else alert(d.message||d.error)}).catch(()=>alert('Checkout unavailable'))">Subscribe</button>
      </div>
    </div>
  </div>

  <div class="use-cases">
    <h2>Built for</h2>
    <ul>
      <li><strong>AI agents</strong> — Share reports, code reviews, and analysis with humans via a clean link</li>
      <li><strong>CI/CD pipelines</strong> — Post build reports, test results, and deploy summaries</li>
      <li><strong>Bots &amp; automations</strong> — Send rich formatted content to Slack, Discord, or email as a link</li>
      <li><strong>Developers</strong> — Quick-share code snippets, docs, and notes without creating a repo or gist</li>
    </ul>
  </div>
</div>
<script>
// Code tabs
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var tab = this.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    this.classList.add('active');
    document.querySelector('.tab-panel[data-tab="' + tab + '"]').classList.add('active');
  });
});

document.getElementById('demo-btn').addEventListener('click', function() {
  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Generating demo page...';
  fetch('${baseUrl}/api/demo', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.url) throw new Error(d.error);
      var result = document.getElementById('demo-result');
      var link = document.getElementById('demo-link');
      link.href = d.url;
      link.textContent = d.url;
      result.style.display = 'block';
      btn.textContent = 'Generate Another Demo';
      btn.disabled = false;
    })
    .catch(function() { btn.disabled = false; btn.textContent = 'View Demo'; });
});
</script>
</body>
</html>`;
}

export function checkoutSuccessTemplate(opts: { apiKey: string; baseUrl: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>peekmd - subscription active</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; background: #1a1a2e; color: #94a3b8; margin: 0; padding: 20px;
  box-sizing: border-box;
}
.card {
  background: #16213e; border-radius: 12px; padding: 40px; max-width: 560px;
  width: 100%; text-align: center; border: 1px solid #334155;
}
h1 { color: #60a5fa; font-size: 1.8em; margin: 0 0 8px; }
.subtitle { color: #e2e8f0; font-size: 1.1em; margin-bottom: 24px; }
.key-label { color: #94a3b8; font-size: 0.9em; margin-bottom: 8px; }
.key-box {
  background: #11111b; border: 1px solid #334155; border-radius: 8px;
  padding: 14px 18px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.85em;
  color: #60a5fa; word-break: break-all; cursor: pointer; position: relative;
  transition: border-color 0.2s;
}
.key-box:hover { border-color: #60a5fa; }
.key-box::after {
  content: 'click to copy'; position: absolute; top: -20px; right: 8px;
  font-size: 0.7em; color: #64748b; font-family: sans-serif;
}
.copied::after { content: 'copied!'; color: #60a5fa; }
.usage { text-align: left; margin-top: 24px; background: #11111b; border-radius: 8px; padding: 16px 18px; }
.usage h3 { color: #e2e8f0; margin: 0 0 8px; font-size: 0.95em; }
.usage code { background: #1a1a2e; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; color: #60a5fa; }
.usage pre {
  background: #1a1a2e; border-radius: 6px; padding: 12px; overflow-x: auto;
  font-size: 0.82em; color: #e2e8f0; margin: 8px 0 0;
}
.links { margin-top: 20px; }
.links a {
  color: #60a5fa; text-decoration: none; margin: 0 12px; font-size: 0.9em;
}
.links a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="card">
  <h1>Subscription Active</h1>
  <p class="subtitle">Your peekmd subscription is now active.</p>

  <p class="key-label">Your API key:</p>
  <div class="key-box" id="api-key" onclick="navigator.clipboard.writeText(this.textContent.trim());this.classList.add('copied');setTimeout(()=>this.classList.remove('copied'),2000)">${opts.apiKey}</div>

  <div class="usage">
    <h3>How to use</h3>
    <p>Pass your API key as a Bearer token on all requests:</p>
    <pre>curl -X POST ${opts.baseUrl}/api/create \\
  -H "Authorization: Bearer ${opts.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"markdown": "# Hello", "ttl": 86400}'</pre>
  </div>

  <div class="links">
    <a href="${opts.baseUrl}">Home</a>
    <a href="${opts.baseUrl}/api/pricing">Pricing</a>
  </div>
</div>
</body>
</html>`;
}

export function keyManagementTemplate(opts: { baseUrl: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>peekmd - API Key Management</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; background: #1a1a2e; color: #94a3b8; margin: 0; padding: 20px;
  box-sizing: border-box;
}
.card {
  background: #16213e; border-radius: 12px; padding: 40px; max-width: 560px;
  width: 100%; border: 1px solid #334155;
}
h1 { color: #60a5fa; font-size: 1.8em; margin: 0 0 8px; text-align: center; }
.subtitle { color: #e2e8f0; font-size: 1.1em; margin-bottom: 28px; text-align: center; }
h2 { color: #e2e8f0; font-size: 1.1em; margin: 24px 0 12px; border-top: 1px solid #334155; padding-top: 20px; }
h2:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
label { display: block; color: #94a3b8; font-size: 0.9em; margin-bottom: 6px; }
input[type="text"], input[type="email"] {
  width: 100%; padding: 10px 14px; background: #11111b; border: 1px solid #334155;
  border-radius: 8px; color: #e2e8f0; font-size: 0.9em; font-family: inherit;
  box-sizing: border-box;
}
input:focus { outline: none; border-color: #60a5fa; }
button {
  padding: 10px 20px; border: none; border-radius: 8px; font-size: 0.9em;
  cursor: pointer; margin-top: 12px; font-weight: 500; transition: background 0.2s;
}
.btn-primary { background: #3b82f6; color: #fff; }
.btn-primary:hover { background: #2563eb; }
.btn-danger { background: #dc2626; color: #fff; }
.btn-danger:hover { background: #b91c1c; }
.btn-muted { background: #334155; color: #e2e8f0; }
.btn-muted:hover { background: #475569; }
.result {
  margin-top: 12px; padding: 12px 14px; border-radius: 8px; font-size: 0.85em;
  display: none; word-break: break-all;
}
.result.success { display: block; background: #064e3b; color: #6ee7b7; border: 1px solid #065f46; }
.result.error { display: block; background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; }
.key-display {
  background: #11111b; border: 1px solid #334155; border-radius: 8px;
  padding: 14px 18px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.85em;
  color: #60a5fa; word-break: break-all; cursor: pointer; position: relative;
  margin-top: 8px; transition: border-color 0.2s;
}
.key-display:hover { border-color: #60a5fa; }
.note { color: #64748b; font-size: 0.8em; margin-top: 8px; }
.info-row { display: flex; justify-content: space-between; margin-top: 4px; font-size: 0.85em; }
.info-row .label { color: #64748b; }
.info-row .value { color: #e2e8f0; }
.links { margin-top: 24px; text-align: center; border-top: 1px solid #334155; padding-top: 16px; }
.links a { color: #60a5fa; text-decoration: none; margin: 0 12px; font-size: 0.9em; }
.links a:hover { text-decoration: underline; }
.section { margin-bottom: 8px; }
</style>
</head>
<body>
<div class="card">
  <h1>API Key Management</h1>
  <p class="subtitle">View, rotate, or recover your peekmd API key.</p>

  <div class="section">
    <h2>View / Rotate Key</h2>
    <label for="api-key-input">Your current API key</label>
    <input type="text" id="api-key-input" placeholder="sk_..." autocomplete="off" spellcheck="false">

    <div style="display: flex; gap: 8px; margin-top: 12px;">
      <button class="btn-primary" onclick="viewKey()">View Key Info</button>
      <button class="btn-danger" onclick="rotateKey()">Rotate Key</button>
    </div>
    <div id="view-result" class="result"></div>
  </div>

  <div class="section">
    <h2>Recover Lost Key</h2>
    <label for="email-input">Email used at checkout</label>
    <input type="email" id="email-input" placeholder="you@example.com">
    <button class="btn-muted" onclick="recoverKey()">Send Recovery Email</button>
    <div id="recover-result" class="result"></div>
    <p class="note">We'll send your current API key to your email. Rate-limited to prevent abuse.</p>
  </div>

  <div class="links">
    <a href="${opts.baseUrl}">Home</a>
    <a href="${opts.baseUrl}/api/pricing">Pricing</a>
  </div>
</div>

<script>
const BASE = ${JSON.stringify(opts.baseUrl)};

function showResult(el, msg, isError) {
  el.textContent = msg;
  el.className = 'result ' + (isError ? 'error' : 'success');
}

async function viewKey() {
  const el = document.getElementById('view-result');
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { showResult(el, 'Please enter your API key.', true); return; }
  try {
    const res = await fetch(BASE + '/api/keys', { headers: { 'Authorization': 'Bearer ' + key } });
    const data = await res.json();
    if (!res.ok) { showResult(el, data.error || 'Request failed', true); return; }
    el.className = 'result success';
    el.innerHTML = '<div class="info-row"><span class="label">Key:</span><span class="value">' + data.maskedKey + '</span></div>'
      + '<div class="info-row"><span class="label">Plan:</span><span class="value">' + (data.plan || 'none') + '</span></div>'
      + '<div class="info-row"><span class="label">Customer:</span><span class="value">' + data.customerId + '</span></div>';
  } catch (e) { showResult(el, 'Network error: ' + e.message, true); }
}

async function rotateKey() {
  const el = document.getElementById('view-result');
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { showResult(el, 'Please enter your current API key.', true); return; }
  if (!confirm('This will invalidate your current key immediately. Continue?')) return;
  try {
    const res = await fetch(BASE + '/api/keys/rotate', { method: 'POST', headers: { 'Authorization': 'Bearer ' + key } });
    const data = await res.json();
    if (!res.ok) { showResult(el, data.error || 'Rotation failed', true); return; }
    el.className = 'result success';
    el.innerHTML = '<strong>Key rotated!</strong> Your new key:<div class="key-display" onclick="navigator.clipboard.writeText(this.textContent.trim())">' + data.newKey + '</div>'
      + '<div class="note" style="margin-top:8px">Old key (' + data.oldKeyPrefix + ') is now invalid.' + (data.emailSent ? ' New key emailed to you.' : '') + '</div>';
    document.getElementById('api-key-input').value = data.newKey;
  } catch (e) { showResult(el, 'Network error: ' + e.message, true); }
}

async function recoverKey() {
  const el = document.getElementById('recover-result');
  const email = document.getElementById('email-input').value.trim();
  if (!email) { showResult(el, 'Please enter your email.', true); return; }
  try {
    const res = await fetch(BASE + '/api/keys/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    });
    const data = await res.json();
    if (res.status === 429) { showResult(el, data.message || 'Too many attempts. Try again later.', true); return; }
    showResult(el, data.message || 'Check your email.', false);
  } catch (e) { showResult(el, 'Network error: ' + e.message, true); }
}
</script>
</body>
</html>`;
}

export function notFoundTemplate(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>peekmd - not found</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; background: #1a1a2e; color: #94a3b8; margin: 0;
}
.msg { text-align: center; }
h1 { font-size: 3em; margin-bottom: 0.2em; color: #e2e8f0; }
p { font-size: 1.1em; }
</style>
</head>
<body>
<div class="msg">
<h1>404</h1>
<p>This page doesn't exist or has expired.</p>
</div>
</body>
</html>`;
}
