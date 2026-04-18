#!/usr/bin/env bash
set -euo pipefail

# Configure Cloudflare WAF rate limiting rules for peekmd.dev zone.
# Idempotent — safe to run on every deploy (PUT replaces the entire ruleset).
#
# Required env vars:
#   CF_API_TOKEN  — Cloudflare API token with Zone WAF Edit permission
#   CF_ZONE_ID    — Zone ID for peekmd.dev

: "${CF_API_TOKEN:?CF_API_TOKEN is required}"
: "${CF_ZONE_ID:?CF_ZONE_ID is required}"

echo "Configuring WAF rate limiting rules for zone ${CF_ZONE_ID}..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/rulesets/phases/http_ratelimit/entrypoint" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "description": "API burst limit - 10 req/10s per IP on write endpoints",
        "expression": "((http.request.uri.path in {\"/api/create\" \"/api/demo\"} and http.request.method eq \"POST\") or starts_with(http.request.uri.path, \"/api/challenge/\"))",
        "action": "block",
        "ratelimit": {
          "characteristics": ["cf.colo.id", "ip.src"],
          "period": 10,
          "requests_per_period": 10,
          "mitigation_timeout": 10
        }
      }
    ]
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('success') else 1)" 2>/dev/null; then
  echo "✅ WAF rate limiting rules configured successfully"
else
  echo "❌ Failed to configure WAF rules (HTTP ${HTTP_CODE}):"
  echo "$BODY" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin),indent=2))" 2>/dev/null || echo "$BODY"
  exit 1
fi
