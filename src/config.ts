/**
 * MCP server configuration.
 *
 * BASE_URL: Lucky Races API host (reads + x402 endpoints).
 * WALLET_PRIVATE_KEY: Agent wallet for x402 payments (optional — only needed for paid tools).
 */

export const BASE_URL = process.env.LUCKY_RACES_URL || "https://luckyraces.com";
export const WALLET_PRIVATE_KEY = process.env.LUCKY_RACES_WALLET_KEY || "";
export const X402_NETWORK = process.env.LUCKY_RACES_NETWORK || "base-mainnet";
