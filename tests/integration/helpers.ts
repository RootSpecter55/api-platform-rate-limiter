import request from 'supertest';
import type { Express } from 'express';
import { getPrisma } from '../../src/common/db';
import { getRedis } from '../../src/common/redis';

export const ADMIN = { Authorization: `Bearer ${process.env.ADMIN_API_KEY}` };

/** Empties every table except the seeded tiers, and the test Redis database. */
export async function resetState() {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe('TRUNCATE api_keys, links, usage_daily CASCADE');
  await prisma.tier.deleteMany({ where: { code: { notIn: ['free', 'pro', 'enterprise'] } } });
  await getRedis().flushdb();
}

export async function disconnect() {
  await getPrisma().$disconnect();
  await getRedis().quit();
}

export async function createTier(app: Express, code: string, burst: number, rpm: number) {
  const res = await request(app)
    .post('/v1/admin/tiers')
    .set(ADMIN)
    .send({ code, name: code, burst, requestsPerMinute: rpm })
    .expect(201);
  return res.body.data.id as string;
}

export type TestKey = { id: string; key: string; auth: { Authorization: string } };

/** Creates an API key on the given tier (by code). */
export async function createKey(app: Express, tierCode = 'free', name = 'test'): Promise<TestKey> {
  const tier = await getPrisma().tier.findUniqueOrThrow({ where: { code: tierCode } });
  const res = await request(app)
    .post('/v1/admin/api-keys')
    .set(ADMIN)
    .send({ name, tierId: tier.id })
    .expect(201);
  const { apiKey, key } = res.body.data;
  return { id: apiKey.id, key, auth: { Authorization: `Bearer ${key}` } };
}
