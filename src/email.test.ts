import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendApiKeyEmail } from './email.js';

describe('sendApiKeyEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends email via Resend API and returns true on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }),
    );

    const result = await sendApiKeyEmail({
      resendApiKey: 're_test_123',
      from: 'peekmd <keys@peekmd.dev>',
      to: 'user@example.com',
      apiKey: 'sk_abc123',
      plan: 'pro',
      baseUrl: 'https://peekmd.dev',
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts?.method).toBe('POST');

    const headers = opts?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer re_test_123');

    const body = JSON.parse(opts?.body as string);
    expect(body.to).toEqual(['user@example.com']);
    expect(body.from).toBe('peekmd <keys@peekmd.dev>');
    expect(body.subject).toBe('Your peekmd API Key');
    expect(body.html).toContain('sk_abc123');
    expect(body.html).toContain('Pro');
    expect(body.text).toContain('sk_abc123');
  });

  it('returns false on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    const result = await sendApiKeyEmail({
      resendApiKey: 're_test_123',
      from: 'peekmd <keys@peekmd.dev>',
      to: 'user@example.com',
      apiKey: 'sk_abc123',
    });

    expect(result).toBe(false);
  });

  it('returns false on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );

    const result = await sendApiKeyEmail({
      resendApiKey: 'bad_key',
      from: 'peekmd <keys@peekmd.dev>',
      to: 'user@example.com',
      apiKey: 'sk_abc123',
    });

    expect(result).toBe(false);
  });

  it('uses default plan name when plan not provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }),
    );

    await sendApiKeyEmail({
      resendApiKey: 're_test_123',
      from: 'test@test.com',
      to: 'user@example.com',
      apiKey: 'sk_abc123',
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.html).toContain('Subscriber');
  });
});
