/** Free discovery, state, and simulation tools. */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GAMEPLAY_URL } from "../config.js";
import { freeFetch } from "../x402Client.js";
import { simulateRace } from "../simulate/simulateRace.js";

const output = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
async function live(path: string) { try { return output(await freeFetch(path, GAMEPLAY_URL)); } catch (error) { return { ...output({ error: error instanceof Error ? error.message : "gameplay unavailable" }), isError: true }; } }

export function registerFreeTools(server: McpServer) {
  server.tool("get_game_info", "Get the live agent gameplay capabilities and rules.", {}, async () => output({
    name: "Lucky Races", mode: "Hosted on-chain beta", website: "https://luckyraces.com/agents",
    loop: ["list_open_lobbies", "enter_race or create_lobby", "fill_lobby_bot", "start_race", "get_agent_race_state", "submit_turn_choices", "get_agent_job", "repeat"],
    choices: { speedMode: ["cruise", "push", "overdrive"], lanes: [0, 1, 2], optional: ["itemIndex", "useShield", "projectileLane", "blockDrafters"] },
    payments: { enter_race: "$0.05 USDC", create_lobby: "$0.05 USDC", fill_lobby_bot: "$0.01 USDC", start_race: "$0.01 USDC", submit_turn_choices: "$0.01 USDC" },
  }));

  server.tool("get_agent_status", "Check whether live agent gameplay and x402 are available.", {}, () => live("/api/agent/status"));
  server.tool("list_open_lobbies", "List live lobbies available to agents.", {}, () => live("/api/agent/open-lobbies"));
  server.tool("get_agent_race_state", "Read live race state and optional racer stats/inventory.", {
    raceId: z.string().regex(/^\d+$/), racerId: z.number().int().positive().optional(),
  }, ({ raceId, racerId }) => live(`/api/agent/races/${raceId}/state${racerId ? `?racerId=${racerId}` : ""}`));
  server.tool("get_agent_job", "Poll the signed status URL returned by a paid action.", {
    statusUrl: z.string().regex(/^\/api\/agent\/jobs\/(enter|turn|host|start|fill)\/[A-Za-z0-9_-]+\?token=[a-f0-9]{64}$/),
  }, ({ statusUrl }) => live(statusUrl));

  server.tool("simulate_race", "Test a strategy locally without payment or chain writes.", {
    laps: z.number().int().min(1).max(5).default(2), lanes: z.number().int().min(2).max(5).default(3),
    spaces: z.number().int().min(20).max(60).default(30), seed: z.number().int().default(42),
    racers: z.array(z.object({ id: z.number().int(), speed: z.number().int().min(1).max(10), acceleration: z.number().int().min(1).max(10), handling: z.number().int().min(1).max(10), strategy: z.enum(["aggressive", "defensive", "balanced", "chaotic", "sniper", "turtle", "opportunist"]).default("balanced") })).min(2).max(8),
  }, (input) => Promise.resolve(output(simulateRace(input))));
}
