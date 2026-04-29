// Lightweight smoke tests. Run with `node --test --import tsx src/simulate/simulateRace.test.ts`.
// (The MCP package doesn't ship a test runner; run when iterating.)

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { simulateRace, type SimRacer } from "./simulateRace.js";

const racers: SimRacer[] = [
  { id: 1, speed: 8, acceleration: 4, handling: 4, strategy: "aggressive" },
  { id: 2, speed: 6, acceleration: 6, handling: 4, strategy: "balanced" },
  { id: 3, speed: 5, acceleration: 4, handling: 6, strategy: "defensive" },
  { id: 4, speed: 4, acceleration: 4, handling: 4, strategy: "turtle" },
];

test("deterministic for the same seed", () => {
  const a = simulateRace({ laps: 2, lanes: 3, spaces: 30, seed: 42, racers });
  const b = simulateRace({ laps: 2, lanes: 3, spaces: 30, seed: 42, racers });
  assert.deepEqual(a, b);
});

test("turtle generally finishes last", () => {
  let turtleLastCount = 0;
  for (let s = 1; s <= 20; s++) {
    const r = simulateRace({ laps: 2, lanes: 3, spaces: 30, seed: s, racers });
    if (r.finishOrder[r.finishOrder.length - 1].id === 4) turtleLastCount++;
  }
  assert.ok(turtleLastCount >= 12, `turtleLastCount=${turtleLastCount}, expected >= 12`);
});

test("all racers eventually finish under the tick ceiling", () => {
  const r = simulateRace({ laps: 3, lanes: 3, spaces: 30, seed: 7, racers });
  for (const f of r.finishOrder) {
    assert.ok(f.ticks > 0);
  }
});
