/**
 * Email delivery via Resend.
 * Sends API key emails: welcome, rotation, and recovery.
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

export interface SendRotationEmailOpts {
  resendApiKey: string;
  from: string;
  to: string;
  newApiKey: string;
  oldKeyPrefix: string;
  baseUrl?: string;
}

/**
 * Notify subscriber that their API key was rotated.
 */
export async function sendRotationEmail(opts: SendRotationEmailOpts): Promise<boolean> {
  const { resendApiKey, from, to, newApiKey, oldKeyPrefix, baseUrl } = opts;
  const base = baseUrl || 'https://peekmd.dev';

  const htmlBody = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6d28d9;">API Key Rotated</h1>
  <p>Your peekmd API key has been rotated. The old key (<code>${oldKeyPrefix}</code>) is now invalid.</p>
  <p>Here's your new API key:</p>
  <div style="background: #1e1b4b; color: #c4b5fd; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all;">
    ${newApiKey}
  </div>
  <p style="margin-top: 16px;">Update your integrations to use this new key:</p>
  <pre style="background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px;"><code>Authorization: Bearer ${newApiKey}</code></pre>
  <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
    If you did not request this rotation, contact support immediately.
  </p>
</div>`;

  const textBody = `API Key Rotated

Your peekmd API key has been rotated. The old key (${oldKeyPrefix}) is now invalid.

Your new API key:

${newApiKey}

Update your integrations:

Authorization: Bearer ${newApiKey}

If you did not request this rotation, contact support immediately.`;

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
        subject: 'peekmd API Key Rotated',
        html: htmlBody,
        text: textBody,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface SendRecoveryEmailOpts {
  resendApiKey: string;
  from: string;
  to: string;
  apiKey: string;
  baseUrl?: string;
}

/**
 * Send the current API key to a subscriber for recovery.
 */
export async function sendRecoveryEmail(opts: SendRecoveryEmailOpts): Promise<boolean> {
  const { resendApiKey, from, to, apiKey, baseUrl } = opts;
  const base = baseUrl || 'https://peekmd.dev';

  const htmlBody = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6d28d9;">API Key Recovery</h1>
  <p>You requested your peekmd API key. Here it is:</p>
  <div style="background: #1e1b4b; color: #c4b5fd; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all;">
    ${apiKey}
  </div>
  <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
    If you did not request this, you can safely ignore this email.
    If you believe your key has been compromised, rotate it at <code>${base}/api/keys/rotate</code>.
  </p>
</div>`;

  const textBody = `API Key Recovery

You requested your peekmd API key. Here it is:

${apiKey}

If you did not request this, you can safely ignore this email.
If you believe your key has been compromised, rotate it at ${base}/api/keys/rotate`;

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
        subject: 'peekmd API Key Recovery',
        html: htmlBody,
        text: textBody,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
