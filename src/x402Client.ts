/**
 * Lightweight x402 payment client.
 *
 * When a request returns HTTP 402, the response includes payment requirements
 * in the body. This client extracts requirements, constructs a payment via
 * the facilitator, and retries the request with the payment header.
 *
 * For agents without a wallet configured, paid tool calls return the 402
 * requirements so the agent can handle payment externally.
 */

import { BASE_URL, WALLET_PRIVATE_KEY } from "./config.js";

export interface X402Requirements {
  accepts: {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    outputSchema: unknown;
  };
  error: string;
}

export interface X402Result {
  paid: boolean;
  data?: unknown;
  paymentRequired?: X402Requirements;
  error?: string;
}

/**
 * Make a request to an x402-protected endpoint.
 * If wallet is configured, attempts automatic payment.
 * Otherwise returns the payment requirements for external handling.
 */
export async function x402Fetch(
  path: string,
  options: RequestInit = {}
): Promise<X402Result> {
  const url = `${BASE_URL}${path}`;

  // First attempt — may return 402
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Free endpoint or already paid
  if (res.ok) {
    const data = await res.json();
    return { paid: false, data };
  }

  // x402 payment required
  if (res.status === 402) {
    const requirements = await res.json() as X402Requirements;

    // No wallet configured — return requirements for external payment
    if (!WALLET_PRIVATE_KEY) {
      return {
        paid: false,
        paymentRequired: requirements,
        error: "Payment required. Configure LUCKY_RACES_WALLET_KEY to enable automatic payments, or handle x402 payment externally.",
      };
    }

    // Wallet configured — attempt payment through facilitator
    // The x402 flow: get payment details from 402 response, pay via facilitator,
    // retry with X-PAYMENT header
    try {
      const paymentHeader = await negotiatePayment(requirements);

      const retryRes = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": paymentHeader,
          ...options.headers,
        },
      });

      if (retryRes.ok) {
        const data = await retryRes.json();
        return { paid: true, data };
      }

      return {
        paid: false,
        error: `Payment retry failed: ${retryRes.status} ${retryRes.statusText}`,
      };
    } catch (err) {
      return {
        paid: false,
        paymentRequired: requirements,
        error: `Payment negotiation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Other HTTP errors
  const text = await res.text().catch(() => "");
  return {
    paid: false,
    error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
  };
}

/**
 * Negotiate payment with the x402 facilitator.
 * Returns the X-PAYMENT header value to include in the retry request.
 */
async function negotiatePayment(requirements: X402Requirements): Promise<string> {
  // The facilitator endpoint is derived from the x402 discovery document.
  // For Coinbase CDP: https://api.cdp.coinbase.com/platform/v2/x402
  // For testnet: https://x402.org/facilitator
  //
  // This is a simplified flow — a production implementation would use
  // the @x402/evm client SDK for proper EVM payment signing.

  const facilitatorUrl = "https://x402.org/facilitator/verify";

  const paymentPayload = {
    wallet: WALLET_PRIVATE_KEY,
    requirements,
  };

  const res = await fetch(facilitatorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentPayload),
  });

  if (!res.ok) {
    throw new Error(`Facilitator returned ${res.status}`);
  }

  const result = await res.json() as { paymentHeader: string };
  return result.paymentHeader;
}

/**
 * Simple fetch wrapper for free (non-x402) endpoints.
 */
export async function freeFetch(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}
