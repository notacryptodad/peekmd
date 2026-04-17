/**
 * Email delivery via Resend.
 * Sends API key to subscriber after successful Stripe checkout.
 */

export interface SendApiKeyEmailOpts {
  resendApiKey: string;
  from: string;
  to: string;
  apiKey: string;
  plan?: string;
  baseUrl?: string;
}

/**
 * Send the API key to a new subscriber via Resend.
 * Returns true on success, false on failure (non-throwing for resilience).
 */
export async function sendApiKeyEmail(opts: SendApiKeyEmailOpts): Promise<boolean> {
  const { resendApiKey, from, to, apiKey, plan, baseUrl } = opts;
  const planName = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Subscriber';

  const htmlBody = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6d28d9;">Welcome to peekmd!</h1>
  <p>Your <strong>${planName}</strong> account is ready. Here's your API key:</p>
  <div style="background: #1e1b4b; color: #c4b5fd; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all;">
    ${apiKey}
  </div>
  <h2 style="margin-top: 24px;">Quick Start</h2>
  <pre style="background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px;"><code>curl -X POST ${baseUrl || 'https://peekmd.dev'}/api/create \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{"markdown": "# Hello\\nYour first page!", "ttl": 3600}'</code></pre>
  <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
    Keep this key safe — it grants access to your peekmd account.
    If you need to rotate your key, visit your billing portal.
  </p>
</div>`;

  const textBody = `Welcome to peekmd!

Your ${planName} account is ready. Here's your API key:

${apiKey}

Quick start:

curl -X POST ${baseUrl || 'https://peekmd.dev'}/api/create \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{"markdown": "# Hello\\nYour first page!", "ttl": 3600}'

Keep this key safe — it grants access to your peekmd account.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: 'Your peekmd API Key',
        html: htmlBody,
        text: textBody,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
