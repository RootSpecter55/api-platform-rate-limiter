import type { Request, Response } from 'express';
import pino from 'pino';
import { RateLimitedError } from '../../src/common/errors';
import { createRateLimit } from '../../src/rate-limiter/rate-limit.middleware';
import type { TokenBucket } from '../../src/rate-limiter/token-bucket';

const client = {
  id: 'key-1',
  name: 'test',
  tier: { code: 'free', burst: 10, requestsPerMinute: 60 },
};

function run(take: TokenBucket['take']) {
  const middleware = createRateLimit({ take } as TokenBucket, pino({ level: 'silent' }));
  const headers: Record<string, string> = {};
  const res = {
    set: (name: string, value: string) => (headers[name] = value),
  } as unknown as Response;
  const next = jest.fn();
  return { done: middleware({ client } as Request, res, next), next, headers };
}

describe('rate limit middleware', () => {
  it("uses the key's tier and sets RateLimit headers when allowed", async () => {
    const take = jest.fn().mockResolvedValue({ allowed: true, remaining: 7, retryAfterMs: 0 });
    const { done, next, headers } = run(take);
    await done;

    expect(take).toHaveBeenCalledWith('rl:key-1', 10, 60);
    expect(headers).toEqual({ 'RateLimit-Limit': '10', 'RateLimit-Remaining': '7' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with Retry-After rounded up to whole seconds', async () => {
    const take = jest.fn().mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 1200 });
    const { done, next, headers } = run(take);
    await done;

    expect(headers['Retry-After']).toBe('2');
    expect(next.mock.calls[0][0]).toBeInstanceOf(RateLimitedError);
  });

  it('fails open when Redis is unavailable', async () => {
    const take = jest.fn().mockRejectedValue(new Error('Connection is closed.'));
    const { done, next, headers } = run(take);
    await done;

    expect(next).toHaveBeenCalledWith();
    expect(headers).toEqual({});
  });
});
