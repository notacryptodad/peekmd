/**
 * x402 (Coinbase HTTP 402) payment integration.
 * Handles 402 response generation and payment verification via facilitator.
 */

import {
  encodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
} from '@x402/core/http';
import type { PaymentRequired as PaymentRequiredType, PaymentPayload } from '@x402/core/types';
import { X402_PRICE_USDC, X402_PRICE_DISPLAY } from './tiers.js';

/** USDC contract addresses by network. */
const USDC_ADDRESSES: Record<string, string> = {
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

/** CAIP-2 chain IDs by network name. */
const CAIP2_NETWORKS: Record<string, string> = {
  'base-sepolia': 'eip155:84532',
  'base': 'eip155:8453',
};

export interface X402Config {
  walletAddress: string;
  network: string; // e.g. "base-sepolia" or "base"
  facilitatorUrl: string;
  assetAddress?: string; // override USDC address
}

export interface X402PaymentResult {
  valid: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Build the 402 Payment Required response body and header.
 */
export function buildPaymentRequired(
  config: X402Config,
  resourceUrl: string,
): { body: object; header: string } {
  const asset = config.assetAddress ?? USDC_ADDRESSES[config.network] ?? USDC_ADDRESSES['base-sepolia'];
  const network = CAIP2_NETWORKS[config.network] ?? config.network;

  const paymentRequired: PaymentRequiredType = {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: 'Create a peekmd page with extended TTL',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: network as `${string}:${string}`,
        amount: X402_PRICE_USDC,
        asset,
        payTo: config.walletAddress,
        maxTimeoutSeconds: 300,
        extra: {},
      },
    ],
    extensions: {},
  };

  const header = encodePaymentRequiredHeader(paymentRequired);

  return {
    header,
    body: {
      error: 'payment_required',
      message: `This request requires payment. Price: ${X402_PRICE_DISPLAY} USDC per page.`,
      x402: paymentRequired,
      alternatives: {
        stripe: 'Use Authorization: Bearer sk_... with a valid Stripe-tier API key for metered billing.',
      },
    },
  };
}

/**
 * Verify and settle a payment via the x402 facilitator.
 */
export async function verifyPayment(
  paymentHeader: string,
  config: X402Config,
  resourceUrl: string,
): Promise<X402PaymentResult> {
  const asset = config.assetAddress ?? USDC_ADDRESSES[config.network] ?? USDC_ADDRESSES['base-sepolia'];
  const network = CAIP2_NETWORKS[config.network] ?? config.network;

  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = decodePaymentSignatureHeader(paymentHeader);
  } catch {
    return { valid: false, error: 'Invalid X-PAYMENT header encoding' };
  }

  const paymentRequirements = {
    scheme: 'exact' as const,
    network,
    amount: X402_PRICE_USDC,
    asset,
    payTo: config.walletAddress,
    maxTimeoutSeconds: 300,
    extra: {},
  };

  // Call facilitator to verify and settle
  try {
    const verifyRes = await fetch(`${config.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: paymentPayload,
        requirements: paymentRequirements,
        resource: resourceUrl,
      }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.text().catch(() => 'unknown error');
      return { valid: false, error: `Facilitator verification failed: ${err}` };
    }

    const verifyResult = (await verifyRes.json()) as { isValid?: boolean };
    if (!verifyResult.isValid) {
      return { valid: false, error: 'Payment verification failed' };
    }

    // Settle the payment
    const settleRes = await fetch(`${config.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: paymentPayload,
        requirements: paymentRequirements,
        resource: resourceUrl,
      }),
    });

    if (!settleRes.ok) {
      const err = await settleRes.text().catch(() => 'unknown error');
      return { valid: false, error: `Facilitator settlement failed: ${err}` };
    }

    const settleResult = (await settleRes.json()) as { txHash?: string; success?: boolean };
    return {
      valid: true,
      txHash: settleResult.txHash,
    };
  } catch (err) {
    return { valid: false, error: `Facilitator request failed: ${(err as Error).message}` };
  }
}

/**
 * Check if x402 is configured (wallet address set).
 */
export function isX402Configured(config: Partial<X402Config>): config is X402Config {
  return !!(config.walletAddress && config.facilitatorUrl);
}
