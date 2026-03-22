/**
 * HTML page template for rendered markdown pages.
 * Features: dark/light mode, styled tables, countdown timer, burn button.
 */

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

/* Ad banner (free tier) */
.ad-banner {
  border-top: 1px solid var(--border);
  padding: 16px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--fg-muted);
  background: var(--table-stripe);
}
.ad-banner a {
  color: var(--link);
  text-decoration: none;
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
</div>
${showAdBanner ? `
<div class="ad-banner">
  Shared with <a href="https://peekmd.com">peekmd</a> &mdash; beautiful markdown, one link away.
  Upgrade for longer TTLs and no banner.
</div>
` : ''}

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

export function landingTemplate(baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>peekmd — beautiful markdown, one link away</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e; color: #e2e8f0; min-height: 100vh;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px 24px;
}
.hero { text-align: center; max-width: 600px; }
h1 { font-size: 2.5em; font-weight: 700; margin-bottom: 0.3em; }
h1 span { color: #60a5fa; }
.tagline { font-size: 1.2em; color: #94a3b8; margin-bottom: 2em; }
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
</style>
</head>
<body>
<div class="hero">
  <h1>peek<span>md</span></h1>
  <p class="tagline">Beautiful markdown, one link away.</p>
  <pre><span class="comment"># Post markdown, get a shareable link</span>
curl -X POST ${baseUrl}/api/create \\
  -H <span class="string">"Content-Type: application/json"</span> \\
  -d '{<span class="key">"markdown"</span>: <span class="string">"# Hello\\nYour markdown here."</span>}'

<span class="comment"># Response:</span>
{ <span class="key">"url"</span>: <span class="string">"${baseUrl}/abc123"</span>, <span class="key">"slug"</span>: <span class="string">"abc123"</span> }</pre>
  <p class="info">Free tier: 5-min TTL. <a href="${baseUrl}/api/pricing">View pricing</a> for extended TTLs.</p>
  <dl class="features">
    <div class="feature"><dt>Syntax highlighting</dt><dd>190+ languages</dd></div>
    <div class="feature"><dt>Dark &amp; light mode</dt><dd>Auto-detected</dd></div>
    <div class="feature"><dt>Auto-expiring</dt><dd>5m to permanent</dd></div>
    <div class="feature"><dt>Burn after reading</dt><dd>One-click delete</dd></div>
  </dl>
</div>
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
