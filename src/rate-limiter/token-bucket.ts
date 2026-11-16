import type { Redis, Result } from 'ioredis';

/**
 * Token bucket as one Lua script. Redis runs a script to completion without interleaving
 * other commands, so read-refill-take-write is atomic: two API instances can never both
 * spend the last token.
 *
 * KEYS[1]  bucket key, a hash with fields `tokens` and `ts` (ms of the last update)
 * ARGV[1]  capacity: the most tokens the bucket holds (the tier's burst)
 * ARGV[2]  refill rate in tokens per millisecond
 * Returns  { allowed (1|0), tokens left (rounded down), ms until a token is available }
 *
 * The time comes from Redis TIME rather than the caller, so every app instance shares one
 * clock. (Redis 7 replicates script effects, which is what allows TIME inside a script.)
 */
export const TOKEN_BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(bucket[1])
local ts = tonumber(bucket[2])
if tokens == nil or ts == nil then
  -- No bucket yet (or it expired): start full.
  tokens = capacity
  ts = now
end

-- Refill for the time elapsed, never above capacity.
tokens = math.min(capacity, tokens + math.max(0, now - ts) * rate)

local allowed = 0
local retry_after_ms = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry_after_ms = math.ceil((1 - tokens) / rate)
end

redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
-- Once the bucket would be full again, the key can go: a missing bucket means "full".
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / rate))

return { allowed, math.floor(tokens), retry_after_ms }
`;

declare module 'ioredis' {
  interface RedisCommander<Context> {
    takeToken(
      key: string,
      capacity: number,
      ratePerMs: number,
    ): Result<[number, number, number], Context>;
  }
}

export type TakeResult = { allowed: boolean; remaining: number; retryAfterMs: number };

export class TokenBucket {
  constructor(private readonly redis: Redis) {
    // defineCommand sends the script once and then calls it by SHA (EVALSHA).
    redis.defineCommand('takeToken', { numberOfKeys: 1, lua: TOKEN_BUCKET_LUA });
  }

  /** Takes one token from `key`. `requestsPerMinute` is the sustained refill rate. */
  async take(key: string, capacity: number, requestsPerMinute: number): Promise<TakeResult> {
    const ratePerMs = requestsPerMinute / 60_000;
    const [allowed, remaining, retryAfterMs] = await this.redis.takeToken(key, capacity, ratePerMs);
    return { allowed: allowed === 1, remaining, retryAfterMs };
  }
}
