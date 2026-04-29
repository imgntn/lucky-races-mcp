// G58: simple in-memory token bucket keyed by an identity string
// (typically the x402 pay-from address; falls back to "anon" for free tools).
// Free tools: 60 calls / minute. Paid tools: 30 calls / minute.

interface Bucket {
  tokens: number;
  capacity: number;
  refillPerMs: number;
  lastRefill: number;
}

const FREE_BUCKETS = new Map<string, Bucket>();
const PAID_BUCKETS = new Map<string, Bucket>();

function take(map: Map<string, Bucket>, key: string, capacity: number, perMinute: number): boolean {
  const now = Date.now();
  let b = map.get(key);
  if (!b) {
    b = { tokens: capacity, capacity, refillPerMs: perMinute / 60_000, lastRefill: now };
    map.set(key, b);
  }
  const elapsed = now - b.lastRefill;
  b.tokens = Math.min(b.capacity, b.tokens + elapsed * b.refillPerMs);
  b.lastRefill = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

export function takeFree(identity = "anon"): boolean {
  return take(FREE_BUCKETS, identity, 60, 60);
}

export function takePaid(identity: string): boolean {
  if (!identity) return false;
  return take(PAID_BUCKETS, identity, 30, 30);
}

export function rateLimitedResponse() {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: "rate limited",
        retryAfter: "Try again in ~1 second",
      }, null, 2),
    }],
    isError: true,
  };
}
