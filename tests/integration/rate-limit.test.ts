import request from 'supertest';
import { createApp } from '../../src/app';
import { getPrisma } from '../../src/common/db';
import { getRedis } from '../../src/common/redis';
import { TokenBucket } from '../../src/rate-limiter/token-bucket';
import { ADMIN, createKey, createTier, disconnect, resetState } from './helpers';

const app = createApp();
const bucket = new TokenBucket(getRedis());

beforeEach(resetState);
afterAll(disconnect);

const ONE_PER_MINUTE = 1; // refill so slow it cannot affect a test

describe('token bucket script (Redis only)', () => {
  it('is atomic: 100 concurrent takes from a bucket of 10 let exactly 10 through', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, () => bucket.take('rl:concurrency', 10, ONE_PER_MINUTE)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });

  it('refills over time at the configured rate', async () => {
    // 600 per minute = one token every 100 ms.
    expect((await bucket.take('rl:refill', 2, 600)).allowed).toBe(true);
    expect((await bucket.take('rl:refill', 2, 600)).allowed).toBe(true);

    const denied = await bucket.take('rl:refill', 2, 600);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(100);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await bucket.take('rl:refill', 2, 600)).allowed).toBe(true);
  });

  it('sets a TTL so idle buckets are cleaned up', async () => {
    await bucket.take('rl:ttl', 5, 60); // full again after 5 s
    const ttl = await getRedis().pttl('rl:ttl');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5_000);
  });
});

describe('rate limiting through the API', () => {
  it('allows the burst, then returns 429 with Retry-After', async () => {
    await createTier(app, 'tiny', 3, ONE_PER_MINUTE);
    const { auth } = await createKey(app, 'tiny');

    for (const remaining of ['2', '1', '0']) {
      const res = await request(app).get('/v1/key').set(auth).expect(200);
      expect(res.headers['ratelimit-limit']).toBe('3');
      expect(res.headers['ratelimit-remaining']).toBe(remaining);
    }

    const limited = await request(app).get('/v1/key').set(auth).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('lets exactly the burst through when requests arrive concurrently', async () => {
    await createTier(app, 'ten', 10, ONE_PER_MINUTE);
    const { auth } = await createKey(app, 'ten');

    const statuses = await Promise.all(
      Array.from({ length: 50 }, () =>
        request(app)
          .get('/v1/key')
          .set(auth)
          .then((r) => r.status),
      ),
    );
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(40);
  });

  it('keeps a separate bucket per API key', async () => {
    await createTier(app, 'one', 1, ONE_PER_MINUTE);
    const first = await createKey(app, 'one', 'first');
    const second = await createKey(app, 'one', 'second');

    await request(app).get('/v1/key').set(first.auth).expect(200);
    await request(app).get('/v1/key').set(first.auth).expect(429);
    await request(app).get('/v1/key').set(second.auth).expect(200);
  });

  it('applies a tier change to the very next request', async () => {
    const { id, auth } = await createKey(app, 'enterprise');
    await request(app).get('/v1/key').set(auth).expect(200);

    await createTier(app, 'single', 1, ONE_PER_MINUTE);
    const single = await getPrisma().tier.findUniqueOrThrow({ where: { code: 'single' } });
    await request(app)
      .patch(`/v1/admin/api-keys/${id}`)
      .set(ADMIN)
      .send({ tierId: single.id })
      .expect(200);

    // The stored tokens are capped at the new, smaller capacity.
    const next = await request(app).get('/v1/key').set(auth).expect(200);
    expect(next.headers['ratelimit-limit']).toBe('1');
    await request(app).get('/v1/key').set(auth).expect(429);
  });

  it('does not rate limit admin routes', async () => {
    for (let i = 0; i < 15; i++) {
      await request(app).get('/v1/admin/tiers').set(ADMIN).expect(200);
    }
  });
});
