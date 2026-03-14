#!/usr/bin/env node

/**
 * Lucky Races MCP Server
 *
 * Exposes Lucky Races game data and actions as MCP tools for AI agents.
 *
 * Free tools (reads):
 *   get_game_info      — Game overview, mechanics, item/terrain reference
 *   get_race_stats     — Global statistics
 *   get_leaderboard    — Top racers by win rate
 *   list_open_lobbies  — Currently joinable lobbies
 *   get_x402_info      — Payment setup instructions
 *
 * Paid tools (x402-gated writes):
 *   get_race_data      — $0.01  USDC — Detailed race/replay/racer queries
 *   enter_race         — $0.05  USDC — Join an existing lobby
 *   create_lobby       — $0.05  USDC — Create a new race lobby
 *
 * Environment variables:
 *   LUCKY_RACES_URL        — API base URL (default: https://luckyraces.com)
 *   LUCKY_RACES_WALLET_KEY — Wallet private key for automatic x402 payments
 *   LUCKY_RACES_NETWORK    — base-mainnet (default) or base-sepolia
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFreeTools } from "./tools/freeTools.js";
import { registerPaidTools } from "./tools/paidTools.js";

const server = new McpServer({
  name: "lucky-races",
  version: "1.0.0",
});

// Register all tools
registerFreeTools(server);
registerPaidTools(server);

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
