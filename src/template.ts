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
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e; color: #e2e8f0; min-height: 100vh;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px 24px;
}
.hero { text-align: center; max-width: 640px; }
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
          <li>Permanent page TTL</li>
          <li>No ads</li>
          <li>API key access</li>
        </ul>
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
