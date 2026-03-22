/**
 * SVG OG image for social sharing previews (1200x630).
 * Branded card with peekmd logo, tagline, and code snippet.
 */
export function ogImageSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- Decorative code block -->
  <rect x="640" y="160" width="480" height="310" rx="12" fill="#11111b" stroke="#334155" stroke-width="1"/>
  <circle cx="668" cy="186" r="6" fill="#f87171"/>
  <circle cx="690" cy="186" r="6" fill="#fbbf24"/>
  <circle cx="712" cy="186" r="6" fill="#34d399"/>
  <text font-family="monospace" font-size="18" y="230" x="670">
    <tspan fill="#6c7086">// One API call</tspan>
    <tspan x="670" dy="28" fill="#cba6f7">curl</tspan><tspan fill="#cdd6f4"> -X POST /api/create \\</tspan>
    <tspan x="670" dy="28" fill="#cdd6f4">  -d </tspan><tspan fill="#a6e3a1">'{</tspan>
    <tspan x="670" dy="28" fill="#89b4fa">    "markdown"</tspan><tspan fill="#cdd6f4">: </tspan><tspan fill="#a6e3a1">"# Hello"</tspan>
    <tspan x="670" dy="28" fill="#a6e3a1">  }'</tspan>
    <tspan x="670" dy="42" fill="#6c7086">// → shareable link</tspan>
    <tspan x="670" dy="28" fill="#cdd6f4">{ </tspan><tspan fill="#89b4fa">"url"</tspan><tspan fill="#cdd6f4">: </tspan><tspan fill="#a6e3a1">"peekmd.com/abc123"</tspan><tspan fill="#cdd6f4"> }</tspan>
  </text>
  <!-- Brand -->
  <text x="80" y="260" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="700" font-size="72" fill="#e2e8f0">peek<tspan fill="#60a5fa">md</tspan></text>
  <text x="80" y="320" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="28" fill="#94a3b8">Beautiful markdown, one link away.</text>
  <!-- Feature pills -->
  <rect x="80" y="370" width="160" height="36" rx="18" fill="#2d2d44"/>
  <text x="160" y="394" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#60a5fa">190+ languages</text>
  <rect x="260" y="370" width="130" height="36" rx="18" fill="#2d2d44"/>
  <text x="325" y="394" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#60a5fa">dark mode</text>
  <rect x="410" y="370" width="140" height="36" rx="18" fill="#2d2d44"/>
  <text x="480" y="394" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#60a5fa">auto-expiring</text>
  <!-- URL -->
  <text x="80" y="560" font-family="monospace" font-size="20" fill="#475569">peekmd.com</text>
</svg>`;
}
