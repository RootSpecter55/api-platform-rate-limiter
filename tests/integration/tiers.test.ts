import request from 'supertest';
import { createApp } from '../../src/app';
import { ADMIN, disconnect, resetState } from './helpers';

const app = createApp();

beforeEach(resetState);
afterAll(disconnect);

describe('admin tiers', () => {
  it('requires the admin key', async () => {
    await request(app).get('/v1/admin/tiers').expect(401);
    await request(app).get('/v1/admin/tiers').set('Authorization', 'Bearer wrong-key').expect(401);
  });

  it('lists the seeded tiers, smallest burst first, with pagination meta', async () => {
    const res = await request(app).get('/v1/admin/tiers').set(ADMIN).expect(200);
    expect(res.body.data.map((t: { code: string }) => t.code)).toEqual([
      'free',
      'pro',
      'enterprise',
    ]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
  });

  it('creates, updates and deletes a tier', async () => {
    const created = await request(app)
      .post('/v1/admin/tiers')
      .set(ADMIN)
      .send({ code: 'startup', name: 'Startup', burst: 20, requestsPerMinute: 120 })
      .expect(201);
    const id = created.body.data.id;

    const updated = await request(app)
      .patch(`/v1/admin/tiers/${id}`)
      .set(ADMIN)
      .send({ burst: 25 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ code: 'startup', burst: 25 });

    await request(app).delete(`/v1/admin/tiers/${id}`).set(ADMIN).expect(204);
    await request(app).get(`/v1/admin/tiers/${id}`).set(ADMIN).expect(404);
  });

  it('rejects a duplicate code and invalid limits', async () => {
    await request(app)
      .post('/v1/admin/tiers')
      .set(ADMIN)
      .send({ code: 'free', name: 'Again', burst: 1, requestsPerMinute: 1 })
      .expect(409);
    const res = await request(app)
      .post('/v1/admin/tiers')
      .set(ADMIN)
      .send({ code: 'x1', name: 'Bad', burst: 0, requestsPerMinute: 1.5 })
      .expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['burst', 'requestsPerMinute']));
  });
});
