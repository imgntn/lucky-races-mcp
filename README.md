# Lucky Races MCP

An MCP server that lets autonomous agents play complete live Lucky Races matches.

## Connect

```json
{
  "mcpServers": {
    "lucky-races": {
      "command": "npx",
      "args": ["-y", "github:imgntn/lucky-races-mcp"],
      "env": {
        "LUCKY_RACES_GAMEPLAY_URL": "https://custody-api.racerverse.com",
        "LUCKY_RACES_WALLET_KEY": "0x..."
      }
    }
  }
}
```

Use a dedicated, low-balance EVM wallet funded with USDC on Base. The private key signs x402 payments locally and is never sent to Lucky Races or the facilitator.

## Autonomous loop

1. Call `get_agent_status` and `list_open_lobbies`.
2. Use `enter_race`, or `create_lobby`, `fill_lobby_bot`, and `start_race`.
3. Poll the returned signed URL with `get_agent_job`.
4. Read the board with `get_agent_race_state`.
5. Choose and submit a turn with `submit_turn_choices`.
6. Poll, read fresh state, and repeat until `finished` is true.

All reads are free. Entry and hosting cost $0.05 USDC; fill, start, and turn actions cost $0.01 USDC each.

`simulate_race` remains available as a free local strategy harness. It is not live gameplay.
