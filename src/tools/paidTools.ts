/** Paid, x402-authorized actions against the live hosted game. */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GAMEPLAY_URL } from "../config.js";
import { x402Fetch, type X402Result } from "../x402Client.js";

const SPEED = { cruise: 0, push: 1, overdrive: 2 } as const;

function response(result: X402Result, price: string) {
  if (result.paymentRequired) return {
    content: [{ type: "text" as const, text: JSON.stringify({
      error: "x402 payment required", price, network: "Base", details: result.paymentRequired,
      setup: "Set LUCKY_RACES_WALLET_KEY to a funded EVM wallet. The key signs locally and is never transmitted.",
    }, null, 2) }], isError: true,
  };
  if (result.error) return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: result.error }, null, 2) }], isError: true,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify({ ...(result.data as object), payment: price }, null, 2) }] };
}

async function action(path: string, body: unknown, price: string) {
  return response(await x402Fetch(path, { method: "POST", body: JSON.stringify(body) }, GAMEPLAY_URL), price);
}

export function registerPaidTools(server: McpServer) {
  server.tool("enter_race", "Join a live hosted Lucky Races lobby. Costs $0.05 USDC via x402.", {
    raceId: z.string().regex(/^\d+$/), racerId: z.number().int().nonnegative(), startingLane: z.number().int().min(0).max(2).default(0),
  }, (input) => action("/api/agent/enter", input, "$0.05 USDC"));

  server.tool("create_lobby", "Create a live hosted race. Costs $0.05 USDC via x402.", {
    trackId: z.number().int().positive().default(1), numLaps: z.number().int().min(1).max(8).default(2), hostRacerId: z.number().int().min(1).max(10),
  }, (input) => action("/api/agent/host", input, "$0.05 USDC"));

  server.tool("fill_lobby_bot", "Fill one open race slot with a reference bot. Costs $0.01 USDC via x402.", {
    raceId: z.string().regex(/^\d+$/),
  }, (input) => action("/api/agent/fill", input, "$0.01 USDC"));

  server.tool("start_race", "Start and register a filled hosted race. Costs $0.01 USDC via x402.", {
    raceId: z.string().regex(/^\d+$/),
  }, (input) => action("/api/agent/start", input, "$0.01 USDC"));

  server.tool("submit_turn_choices", "Submit one strategic turn to a live race. Costs $0.01 USDC via x402.", {
    raceId: z.string().regex(/^\d+$/), racerId: z.number().int().min(1).max(4),
    speedMode: z.enum(["cruise", "push", "overdrive"]).default("cruise"),
    newLane: z.number().int().min(0).max(2).optional(), itemIndex: z.number().int().min(0).optional(),
    useShield: z.boolean().default(false), projectileLane: z.number().int().min(0).max(2).optional(), blockDrafters: z.boolean().default(false),
  }, ({ newLane, itemIndex, projectileLane, speedMode, ...input }) => action("/api/agent/turn", {
    ...input, speedMode: SPEED[speedMode], laneChoice: newLane ?? 999, itemIndex: itemIndex ?? 999, projectileLane: projectileLane ?? 999,
  }, "$0.01 USDC"));
}
