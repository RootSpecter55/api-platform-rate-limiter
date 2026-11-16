import request from 'supertest';
import { createApp } from '../../src/app';
import { getPrisma } from '../../src/common/db';
import { ADMIN, createKey, disconnect, resetState } from './helpers';

const app = createApp();

beforeEach(resetState);
afterAll(disconnect);

describe('API keys', () => {
  it('creates a key that is shown once and stored only as a hash', async () => {
    const { id, key } = await createKey(app, 'pro', 'Mobile app');
    expect(key).toMatch(/^sk_[A-Za-z0-9_-]{32}$/);

    const row = await getPrisma().apiKey.findUniqueOrThrow({ where: { id } });
    expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.keyHash).not.toContain(key);
    expect(key.startsWith(row.prefix)).toBe(true);

    const fetched = await request(app).get(`/v1/admin/api-keys/${id}`).set(ADMIN).expect(200);
    expect(fetched.body.data).not.toHaveProperty('keyHash');
    expect(JSON.stringify(fetched.body)).not.toContain(key);
    expect(fetched.body.data.tier).toMatchObject({ code: 'pro', burst: 50 });
  });

  it('authenticates a client with its key', async () => {
    const { auth } = await createKey(app, 'free', 'CLI');
    const res = await request(app).get('/v1/key').set(auth).expect(200);
    expect(res.body.data).toMatchObject({ name: 'CLI', tier: { code: 'free' } });

    await request(app).get('/v1/key').expect(401);
    await request(app).get('/v1/key').set('Authorization', 'Bearer sk_not-a-real-key').expect(401);
  });

  it('stops accepting a key as soon as it is revoked', async () => {
    const { id, auth } = await createKey(app);
    await request(app).post(`/v1/admin/api-keys/${id}/revoke`).set(ADMIN).expect(200);
    await request(app).get('/v1/key').set(auth).expect(401);
    await request(app).post(`/v1/admin/api-keys/${id}/revoke`).set(ADMIN).expect(409);
  });

  it('moves a key to another tier', async () => {
    const { id, auth } = await createKey(app, 'free');
    const enterprise = await getPrisma().tier.findUniqueOrThrow({ where: { code: 'enterprise' } });

    await request(app)
      .patch(`/v1/admin/api-keys/${id}`)
      .set(ADMIN)
      .send({ tierId: enterprise.id })
      .expect(200);
    const res = await request(app).get('/v1/key').set(auth).expect(200);
    expect(res.body.data.tier.code).toBe('enterprise');
  });

  it('refuses to delete a tier that keys still use', async () => {
    await createKey(app, 'pro');
    const pro = await getPrisma().tier.findUniqueOrThrow({ where: { code: 'pro' } });
    const res = await request(app).delete(`/v1/admin/tiers/${pro.id}`).set(ADMIN).expect(409);
    expect(res.body.error.message).toContain('used by 1 API key');
  });

  it('rejects a key for an unknown tier', async () => {
    await request(app)
      .post('/v1/admin/api-keys')
      .set(ADMIN)
      .send({ name: 'x', tierId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });
});
