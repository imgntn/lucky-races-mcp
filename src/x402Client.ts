/** Secure x402 client. The private key signs locally and is never sent over HTTP. */
import axios, { AxiosError, type AxiosInstance } from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_URL, WALLET_PRIVATE_KEY } from "./config.js";

export interface X402Result {
  paid: boolean;
  data?: unknown;
  paymentRequired?: unknown;
  error?: string;
}

let paidClient: AxiosInstance | null = null;

function getPaidClient(): AxiosInstance {
  if (paidClient) return paidClient;
  if (!/^0x[a-fA-F0-9]{64}$/.test(WALLET_PRIVATE_KEY)) {
    throw new Error("LUCKY_RACES_WALLET_KEY must be a 32-byte 0x-prefixed EVM private key");
  }
  const client = new x402Client();
  registerExactEvmScheme(client, {
    signer: privateKeyToAccount(WALLET_PRIVATE_KEY as `0x${string}`),
  });
  paidClient = wrapAxiosWithPayment(axios.create(), client);
  return paidClient;
}

export async function x402Fetch(path: string, options: RequestInit = {}, baseUrl = BASE_URL): Promise<X402Result> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const method = (options.method ?? "GET").toLowerCase();
  const headers = { "Content-Type": "application/json", ...(options.headers as Record<string, string> | undefined) };
  const data = typeof options.body === "string" ? JSON.parse(options.body) : options.body;

  if (!WALLET_PRIVATE_KEY) {
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => null);
    if (response.ok) return { paid: false, data: body };
    if (response.status === 402) return { paid: false, paymentRequired: body, error: "x402 payment required" };
    return { paid: false, error: `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}` };
  }

  try {
    const response = await getPaidClient().request({ url, method, headers, data });
    return { paid: true, data: response.data };
  } catch (error) {
    const axiosError = error as AxiosError;
    return {
      paid: false,
      paymentRequired: axiosError.response?.status === 402 ? axiosError.response.data : undefined,
      error: axiosError.response
        ? `HTTP ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data).slice(0, 300)}`
        : axiosError.message,
    };
  }
}

export async function freeFetch(path: string, baseUrl = BASE_URL): Promise<unknown> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => "")}`);
  return response.json();
}
