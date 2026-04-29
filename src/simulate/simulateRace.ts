/**
 * Lightweight in-process race simulator for the simulate_race MCP tool (G53).
 *
 * Goal: give an AI agent a fast, free way to try a strategy and see who
 * would win, without paying for enter_race or running a real chain race.
 *
 * Not a perfect mirror of the on-chain math — it's a rough simulation
 * that captures the dominant terms (speed, acceleration ramp-up, lane
 * change cost, handling-based spinout chance, drafting bonus). Tightening
 * to the contract's exact tick math is a follow-up; for now this is
 * useful as a strategy comparison tool.
 */

export interface SimRacer {
  id: number;
  speed: number;        // 1..10
  acceleration: number; // 1..10
  handling: number;     // 1..10
  strategy:
    | "aggressive"
    | "defensive"
    | "balanced"
    | "chaotic"
    | "sniper"
    | "turtle"
    | "opportunist";
}

export interface SimulateInput {
  laps: number;
  lanes: number;
  spaces: number;
  seed: number;
  racers: SimRacer[];
}

export interface SimResult {
  ticks: number;
  finishOrder: { id: number; ticks: number }[];
  perRacer: Record<number, {
    distanceTravelled: number;
    spinouts: number;
    laneChanges: number;
    averageSpeed: number;
  }>;
  winner: number;
}

// xorshift PRNG
function rng(seed: number) {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

interface RacerRuntime extends SimRacer {
  pos: number; // total spaces travelled (incl. across laps)
  lane: number;
  curSpeed: number;
  finished: boolean;
  finishTick: number | null;
  spinouts: number;
  laneChanges: number;
  speedSum: number;
  speedSamples: number;
}

function pickSpeedMode(rt: RacerRuntime, gapAhead: number, rand: () => number): 0 | 1 | 2 {
  switch (rt.strategy) {
    case "aggressive":
      return gapAhead < 3 ? 2 : 1;
    case "defensive":
      return rt.curSpeed >= rt.speed - 1 ? 0 : 1;
    case "turtle":
      return 0;
    case "chaotic":
      return Math.floor(rand() * 3) as 0 | 1 | 2;
    case "sniper":
      return gapAhead === 1 ? 2 : 1;
    case "opportunist":
      return gapAhead < 4 ? 2 : 0;
    case "balanced":
    default:
      return gapAhead < 5 ? 1 : 0;
  }
}

function pickLane(
  rt: RacerRuntime,
  others: RacerRuntime[],
  totalLanes: number,
  rand: () => number,
): number {
  if (rt.strategy === "turtle") return rt.lane;

  // Drift away from a directly-behind drafter.
  const behind = others.find(
    (o) => o.id !== rt.id
      && o.lane === rt.lane
      && o.pos < rt.pos
      && rt.pos - o.pos <= 3,
  );
  if (behind) {
    if (rt.lane > 0 && rand() < 0.4) return rt.lane - 1;
    if (rt.lane < totalLanes - 1 && rand() < 0.4) return rt.lane + 1;
  }
  if (rt.strategy === "chaotic" && rand() < 0.2) {
    const delta = rand() < 0.5 ? -1 : 1;
    const next = Math.min(totalLanes - 1, Math.max(0, rt.lane + delta));
    return next;
  }
  return rt.lane;
}

export function simulateRace(input: SimulateInput): SimResult {
  const totalDistance = input.spaces * input.laps;
  const rand = rng(input.seed);

  const runtimes: RacerRuntime[] = input.racers.map((r, i) => ({
    ...r,
    pos: 0,
    lane: i % input.lanes,
    curSpeed: 0,
    finished: false,
    finishTick: null,
    spinouts: 0,
    laneChanges: 0,
    speedSum: 0,
    speedSamples: 0,
  }));

  const MAX_TICKS = 4 * totalDistance; // hard ceiling
  let tick = 0;

  while (
    runtimes.some((r) => !r.finished) && tick < MAX_TICKS
  ) {
    tick += 1;

    // Sort by pos asc to compute gapAhead lookups easily.
    const sorted = [...runtimes].sort((a, b) => a.pos - b.pos);

    for (const rt of runtimes) {
      if (rt.finished) continue;

      const ahead = sorted.find((o) => o.id !== rt.id && o.lane === rt.lane && o.pos > rt.pos);
      const gapAhead = ahead ? ahead.pos - rt.pos : input.spaces;

      const speedMode = pickSpeedMode(rt, gapAhead, rand);
      const newLane = pickLane(rt, runtimes, input.lanes, rand);
      const switching = newLane !== rt.lane;

      // Acceleration ramp.
      const target = rt.speed + (speedMode === 1 ? 1 : speedMode === 2 ? 2 : 0);
      const ramp = rt.acceleration / 10; // 0.1 .. 1.0 per tick
      rt.curSpeed = Math.min(target, rt.curSpeed + Math.max(1, target * ramp));

      // Lane-change cost.
      if (switching) {
        rt.curSpeed = Math.max(1, rt.curSpeed - (10 - rt.handling) / 5);
        rt.lane = newLane;
        rt.laneChanges += 1;
      }

      // Spinout risk for overdrive (mode 2). Handling reduces it.
      if (speedMode === 2 && rand() < (10 - rt.handling) / 30) {
        rt.spinouts += 1;
        rt.curSpeed = Math.max(1, rt.curSpeed * 0.4);
      }

      // Drafting bonus: directly behind another racer in the same lane within 3 spaces.
      const draftTarget = sorted.find(
        (o) => o.id !== rt.id
          && o.lane === rt.lane
          && o.pos > rt.pos
          && o.pos - rt.pos <= 3,
      );
      if (draftTarget) rt.curSpeed += 0.5;

      rt.pos += rt.curSpeed;
      rt.speedSum += rt.curSpeed;
      rt.speedSamples += 1;

      if (rt.pos >= totalDistance) {
        rt.finished = true;
        rt.finishTick = tick;
      }
    }
  }

  // Build result.
  const finishOrder = [...runtimes]
    .sort((a, b) => {
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) return (a.finishTick ?? 0) - (b.finishTick ?? 0);
      return b.pos - a.pos;
    })
    .map((r) => ({ id: r.id, ticks: r.finishTick ?? tick }));

  const perRacer: Record<number, SimResult["perRacer"][number]> = {};
  for (const r of runtimes) {
    perRacer[r.id] = {
      distanceTravelled: Math.round(r.pos * 10) / 10,
      spinouts: r.spinouts,
      laneChanges: r.laneChanges,
      averageSpeed:
        r.speedSamples > 0 ? Math.round((r.speedSum / r.speedSamples) * 100) / 100 : 0,
    };
  }

  return {
    ticks: tick,
    finishOrder,
    perRacer,
    winner: finishOrder[0]?.id ?? -1,
  };
}
