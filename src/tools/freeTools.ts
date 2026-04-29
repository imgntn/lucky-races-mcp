/**
 * Free MCP tools — read-only game data queries.
 * No x402 payment required. Gets agents in the door.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BASE_URL } from "../config.js";
import { simulateRace } from "../simulate/simulateRace.js";

async function fetchJSON(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (res.ok) return res.json();
  // x402-protected endpoints return 402 for unauthenticated requests,
  // but free tools hit non-gated paths. If we get 402, the endpoint
  // needs payment — fall back to static/cached data.
  if (res.status === 402) {
    return { error: "This endpoint requires x402 payment. Use the paid version of this tool." };
  }
  throw new Error(`HTTP ${res.status}`);
}

export function registerFreeTools(server: McpServer) {
  // ── get_race_stats ──────────────────────────────────────────
  server.tool(
    "get_race_stats",
    "Get global Lucky Races statistics — total races, active lobbies, blockchain info. Free, no payment required.",
    {},
    async () => {
      try {
        const data = await fetchJSON("/api/x402/race-data?type=stats");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              type: "stats",
              data: {
                totalRaces: "unknown",
                blockchain: "Ethereum (Base for payments)",
                contractArchitecture: "Diamond proxy (EIP-2535)",
                gameUrl: "https://luckyraces.com",
                note: "Live stats unavailable — API may require payment. Use enter_race or get_race_data (paid) for live data.",
              },
            }, null, 2),
          }],
        };
      }
    }
  );

  // ── get_leaderboard ─────────────────────────────────────────
  server.tool(
    "get_leaderboard",
    "Get the Lucky Races leaderboard — top racers ranked by win rate. Free, no payment required.",
    {},
    async () => {
      try {
        const data = await fetchJSON("/api/x402/race-data?type=leaderboard");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              type: "leaderboard",
              note: "Live leaderboard unavailable. Use get_race_data (paid) for guaranteed live data.",
              hint: "Configure LUCKY_RACES_WALLET_KEY for automatic x402 payments.",
            }, null, 2),
          }],
        };
      }
    }
  );

  // ── get_game_info ───────────────────────────────────────────
  server.tool(
    "get_game_info",
    "Get Lucky Races game overview — how the game works, item types, racer stats, track mechanics. Always free.",
    {},
    async () => {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: "Lucky Races",
            description: "On-chain multiplayer racing board game on Ethereum. 4 racers compete on a looping track with items, terrain, and strategic choices each turn.",
            website: "https://luckyraces.com",
            racerverse: "https://racerverse.com",
            architecture: {
              contracts: "Diamond proxy (EIP-2535) with UUPS-upgradeable Track",
              blockchain: "Ethereum (Sepolia testnet, Base for x402 payments)",
              frontend: "React + Three.js isometric 3D board",
            },
            mechanics: {
              turnStructure: "Each tick: choose speed mode, lane, item usage, shield, draft blocking",
              speedModes: ["normal (0)", "push (+1 space)", "overdrive (+2 spaces)"],
              items: {
                Banana: "Drops hazard behind you",
                SpeedBoost: "Move 2 extra spaces",
                Mushroom: "Move 1 extra space",
                MysteryBox: "Random item",
                Invincibility: "Temporary shield from all effects",
                HomingPigeon: "Projectile attack — targets a lane",
              },
              terrain: {
                Sand: "Slows racer down",
                Slime: "Spinout left (lane shift)",
                Slick: "Spinout right (lane shift)",
                SpeedBoost: "Increases racer speed",
              },
              drafting: "Trail behind another racer in the same lane within 3 spaces for a speed bonus. Can be blocked.",
            },
            racerStats: {
              speed: "Maximum spaces per tick at full acceleration",
              acceleration: "How quickly racer reaches max speed",
              handling: "Dodge chance on terrain hazards",
            },
            apiAccess: {
              free: ["get_game_info", "get_race_stats", "get_leaderboard", "list_open_lobbies"],
              paid: {
                "get_race_data": "$0.01 USDC — query specific race/replay/racer data",
                "enter_race": "$0.05 USDC — register bot for lobby entry",
                "create_lobby": "$0.05 USDC — create a new race lobby",
              },
              payment: "x402 protocol — USDC on Base",
            },
          }, null, 2),
        }],
      };
    }
  );

  // ── list_open_lobbies ───────────────────────────────────────
  server.tool(
    "list_open_lobbies",
    "List currently open race lobbies that agents can join. Free, no payment required.",
    {},
    async () => {
      try {
        const data = await fetchJSON("/api/x402/race-data?type=stats");
        const stats = data as { data?: { activeLobbies?: number } };
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              activeLobbies: stats.data?.activeLobbies ?? "unknown",
              note: "Use enter_race (paid) to join a lobby, or create_lobby (paid) to start one.",
              joinRequirements: {
                botAddress: "Your Ethereum wallet address (0x...)",
                racerId: "A Racer NFT token ID",
              },
            }, null, 2),
          }],
        };
      } catch {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              activeLobbies: "unknown",
              note: "Could not fetch live lobby data. The game may be between seasons.",
            }, null, 2),
          }],
        };
      }
    }
  );

  // ── simulate_race ──────────────────────────────────────────
  // Free, server-side mock simulation. Lets agents try strategies without
  // entering a real race. Mirrors the in-board mockEngine's tick math.
  server.tool(
    "simulate_race",
    "Simulate a Lucky Races race in-process with chosen racer stats and strategies. Free, no payment, no chain. Use this to test strategies before paying for enter_race.",
    {
      laps: z.number().int().min(1).max(5).default(2),
      lanes: z.number().int().min(2).max(5).default(3),
      spaces: z.number().int().min(20).max(60).default(30),
      seed: z.number().int().default(42),
      racers: z.array(z.object({
        id: z.number().int(),
        speed: z.number().int().min(1).max(10),
        acceleration: z.number().int().min(1).max(10),
        handling: z.number().int().min(1).max(10),
        strategy: z.enum([
          "aggressive", "defensive", "balanced", "chaotic",
          "sniper", "turtle", "opportunist",
        ]).default("balanced"),
      })).min(2).max(8),
    },
    async ({ laps, lanes, spaces, seed, racers }) => {
      const result = simulateRace({ laps, lanes, spaces, seed, racers });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── get_race_replay ────────────────────────────────────────
  // Free read of completed-race public data via /api/x402/race-data
  // (this endpoint is read-only and price-zero from the marketing
  // analytics pipeline; the paid get_race_data tool exposes deeper
  // detail).
  server.tool(
    "get_race_replay",
    "Fetch the public turn-by-turn replay summary for a completed race. Free; for full state and per-tick item history, use get_race_data (paid).",
    { raceId: z.string().describe("Race id (uint256 as string)") },
    async ({ raceId }) => {
      try {
        const data = await fetchJSON(`/api/x402/race-data?type=replay&id=${encodeURIComponent(raceId)}&summary=1`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Replay summary unavailable",
              hint: "Check the race id, or use get_race_data (paid) for the full record.",
              raceId,
            }, null, 2),
          }],
        };
      }
    }
  );

  // ── get_x402_info ───────────────────────────────────────────
  server.tool(
    "get_x402_info",
    "Get x402 payment configuration for Lucky Races — pricing, network, wallet setup instructions. Free.",
    {},
    async () => {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            protocol: "x402 — HTTP-native payment protocol",
            network: "Base (eip155:8453)",
            currency: "USDC",
            payTo: "0x776a39ad55Bf647B804A7ad42C93d3a9e3569f5b",
            facilitator: "Coinbase Developer Platform",
            discoveryUrl: "https://luckyraces.com/.well-known/x402.json",
            pricing: {
              "get_race_data": "$0.01 per query",
              "enter_race": "$0.05 per entry",
              "create_lobby": "$0.05 per lobby",
            },
            setup: {
              step1: "Set LUCKY_RACES_WALLET_KEY to your wallet's private key (Base network, funded with USDC)",
              step2: "The MCP server handles x402 payment negotiation automatically",
              step3: "Call any paid tool — payment is deducted per-request",
            },
            testnet: {
              note: "For testing, use Base Sepolia with the x402.org facilitator",
              network: "eip155:84532",
              env: "LUCKY_RACES_NETWORK=base-sepolia LUCKY_RACES_URL=https://lucky-races-staging-production.up.railway.app",
            },
          }, null, 2),
        }],
      };
    }
  );
}
