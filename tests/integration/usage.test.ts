import request from 'supertest';
import { createApp } from '../../src/app';
import { getPrisma } from '../../src/common/db';
import { ApiKeyRepository } from '../../src/modules/api-keys/api-keys.repository';
import { UsageRepository } from '../../src/modules/usage/usage.repository';
import { UsageService } from '../../src/modules/usage/usage.service';
import { ADMIN, createKey, createTier, disconnect, resetState } from './helpers';

const app = createApp();

beforeEach(resetState);
afterAll(disconnect);

/** Usage is written after the response is sent, so wait for the counters to settle. */
async function usageRow(apiKeyId: string, expectedTotal: number) {
  for (let i = 0; i < 50; i++) {
    const row = await getPrisma().usageDaily.findFirst({ where: { apiKeyId } });
    if (row && row.requests + row.throttled >= expectedTotal) return row;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('usage was not recorded in time');
}

describe('usage', () => {
  it('counts allowed and throttled requests separately, per key per day', async () => {
    await createTier(app, 'two', 2, 1);
    const { id, auth } = await createKey(app, 'two');

    for (const expected of [200, 200, 429, 429]) {
      await request(app).get('/v1/key').set(auth).expect(expected);
    }

    const row = await usageRow(id, 4);
    expect(row).toMatchObject({ requests: 2, throttled: 2 });
  });

  it('lets a client read its own usage and an admin read any key', async () => {
    const { id, auth } = await createKey(app, 'enterprise');
    await request(app).get('/v1/key').set(auth).expect(200);
    await usageRow(id, 1);

    const today = new Date().toISOString().slice(0, 10);
    const mine = await request(app).get('/v1/usage').set(auth).expect(200);
    // Reading usage is itself a request, but it is recorded after this response.
    expect(mine.body.data).toEqual([{ day: today, requests: 1, throttled: 0 }]);

    const admin = await request(app).get(`/v1/admin/api-keys/${id}/usage`).set(ADMIN).expect(200);
    expect(admin.body.meta.total).toBe(1);
  });

  it('handles concurrent first writes to the same day without losing counts', async () => {
    const { id } = await createKey(app, 'enterprise');
    const prisma = getPrisma();
    const service = new UsageService(prisma, new UsageRepository(), new ApiKeyRepository());
    const day = new Date('2026-03-01T10:00:00Z');

    await Promise.all(Array.from({ length: 30 }, () => service.record(id, false, day)));

    const rows = await prisma.usageDaily.findMany({ where: { apiKeyId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.requests).toBe(30);
  });

  it('filters by date range', async () => {
    const { id, auth } = await createKey(app, 'enterprise');
    await getPrisma().usageDaily.createMany({
      data: [
        { apiKeyId: id, day: new Date('2026-01-01'), requests: 5 },
        { apiKeyId: id, day: new Date('2026-01-02'), requests: 6 },
        { apiKeyId: id, day: new Date('2026-01-03'), requests: 7 },
      ],
    });

    const res = await request(app)
      .get('/v1/usage?from=2026-01-02&to=2026-01-03')
      .set(auth)
      .expect(200);
    expect(res.body.data.map((d: { day: string }) => d.day)).toEqual(['2026-01-03', '2026-01-02']);

    await request(app).get('/v1/usage?from=2026-02-01&to=2026-01-01').set(auth).expect(400);
  });
});
