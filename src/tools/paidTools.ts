/**
 * x402-gated MCP tools — write operations that cost gas/infra.
 * Payment is handled automatically if LUCKY_RACES_WALLET_KEY is set,
 * otherwise returns payment requirements for external handling.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { x402Fetch } from "../x402Client.js";

export function registerPaidTools(server: McpServer) {
  // ── get_race_data (paid) ────────────────────────────────────
  server.tool(
    "get_race_data",
    "Query detailed Lucky Races data — specific race results, turn-by-turn replays, individual racer stats. Costs $0.01 USDC via x402.",
    {
      type: z
        .enum(["race", "replay", "racer", "stats", "leaderboard"])
        .describe("Type of data to query"),
      id: z
        .string()
        .optional()
        .describe("Race ID or Racer ID — required for race, replay, and racer queries"),
    },
    async ({ type, id }) => {
      const params = new URLSearchParams({ type });
      if (id) params.set("id", id);

      const result = await x402Fetch(`/api/x402/race-data?${params}`);

      if (result.paymentRequired) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "x402 payment required",
              price: "$0.01 USDC",
              network: "Base (eip155:8453)",
              setup: "Set LUCKY_RACES_WALLET_KEY environment variable with a funded wallet",
              details: result.paymentRequired,
            }, null, 2),
          }],
          isError: true,
        };
      }

      if (result.error) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ...(result.data as object),
            _payment: result.paid ? "paid via x402" : "free tier",
          }, null, 2),
        }],
      };
    }
  );

  // ── enter_race ──────────────────────────────────────────────
  server.tool(
    "enter_race",
    "Register a bot/agent to join a Lucky Races lobby. Returns a signed entry ticket. Costs $0.05 USDC via x402.",
    {
      botAddress: z
        .string()
        .describe("Bot's Ethereum wallet address (0x...)"),
      racerId: z
        .string()
        .describe("Racer NFT token ID to race with"),
      lobbyId: z
        .string()
        .optional()
        .describe("Existing lobby ID to join. Omit to create a new lobby."),
    },
    async ({ botAddress, racerId, lobbyId }) => {
      const body: Record<string, unknown> = { botAddress, racerId };
      if (lobbyId) body.lobbyId = lobbyId;

      const result = await x402Fetch("/api/x402/bot-entry", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (result.paymentRequired) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "x402 payment required",
              price: "$0.05 USDC",
              network: "Base (eip155:8453)",
              setup: "Set LUCKY_RACES_WALLET_KEY environment variable with a funded wallet",
              details: result.paymentRequired,
            }, null, 2),
          }],
          isError: true,
        };
      }

      if (result.error) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ...(result.data as object),
            _payment: "paid via x402 ($0.05 USDC)",
          }, null, 2),
        }],
      };
    }
  );

  // ── create_lobby ────────────────────────────────────────────
  server.tool(
    "create_lobby",
    "Create a new Lucky Races lobby with custom track configuration. Returns an entry ticket for the new lobby. Costs $0.05 USDC via x402.",
    {
      botAddress: z
        .string()
        .describe("Bot's Ethereum wallet address (0x...)"),
      racerId: z
        .string()
        .describe("Racer NFT token ID to race with"),
      trackLength: z
        .number()
        .default(30)
        .describe("Track length in spaces (default: 30)"),
      laps: z
        .number()
        .default(2)
        .describe("Number of laps (default: 2)"),
      lanes: z
        .number()
        .default(4)
        .describe("Number of lanes (default: 4)"),
      maxRacers: z
        .number()
        .default(4)
        .describe("Maximum racers in the lobby (default: 4)"),
    },
    async ({ botAddress, racerId, trackLength, laps, lanes, maxRacers }) => {
      const body = {
        botAddress,
        racerId,
        trackConfig: {
          length: trackLength,
          laps,
          lanes,
          maxRacers,
        },
      };

      const result = await x402Fetch("/api/x402/bot-entry", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (result.paymentRequired) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "x402 payment required",
              price: "$0.05 USDC",
              network: "Base (eip155:8453)",
              setup: "Set LUCKY_RACES_WALLET_KEY environment variable with a funded wallet",
              details: result.paymentRequired,
            }, null, 2),
          }],
          isError: true,
        };
      }

      if (result.error) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ...(result.data as object),
            _payment: "paid via x402 ($0.05 USDC)",
            _trackConfig: { length: trackLength, laps, lanes, maxRacers },
          }, null, 2),
        }],
      };
    }
  );

  // ── submit_turn_choices (paid) ─────────────────────────────
  // G55: agents play full races, not just enter.
  server.tool(
    "submit_turn_choices",
    "Submit a turn for an active Lucky Races bot. Card choices: speed, lane, item, shield, projectile, blockDrafters. Costs $0.05 USDC via x402.",
    {
      raceId: z.string().describe("Active race id"),
      racerId: z.string().describe("Racer token id you're submitting for"),
      speedMode: z.enum(["cruise", "push", "overdrive"]).default("cruise"),
      newLane: z.number().int().min(0).max(4).optional(),
      itemIndex: z.number().int().min(0).optional(),
      useShield: z.boolean().default(false),
      projectileLane: z.number().int().min(0).max(4).optional(),
      blockDrafters: z.boolean().default(false),
    },
    async (args) => {
      const result = await x402Fetch("/api/x402/submit-turn", {
        method: "POST",
        body: JSON.stringify(args),
      });
      if (result.paymentRequired) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "x402 payment required", price: "$0.05 USDC", details: result.paymentRequired }, null, 2) }],
          isError: true,
        };
      }
      if (result.error) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ ...(result.data as object), _payment: "paid via x402 ($0.05 USDC)" }, null, 2) }],
      };
    }
  );

  // ── get_my_inventory (paid) ────────────────────────────────
  // G56: agents that own racers want to see their items.
  server.tool(
    "get_my_inventory",
    "Get the current item inventory for a specific racer in an active race. Costs $0.01 USDC via x402.",
    {
      raceId: z.string().describe("Active race id"),
      racerId: z.string().describe("Racer token id you own"),
    },
    async ({ raceId, racerId }) => {
      const params = new URLSearchParams({ type: "inventory", raceId, racerId });
      const result = await x402Fetch(`/api/x402/race-data?${params}`);
      if (result.paymentRequired) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "x402 payment required", price: "$0.01 USDC", details: result.paymentRequired }, null, 2) }],
          isError: true,
        };
      }
      if (result.error) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ ...(result.data as object), _payment: "paid via x402 ($0.01 USDC)" }, null, 2) }],
      };
    }
  );
}
