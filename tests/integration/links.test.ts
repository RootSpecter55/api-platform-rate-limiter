import request from 'supertest';
import { createApp } from '../../src/app';
import { getPrisma } from '../../src/common/db';
import { getRedis } from '../../src/common/redis';
import { createKey, disconnect, resetState, type TestKey } from './helpers';

const app = createApp();
let client: TestKey;

beforeEach(async () => {
  await resetState();
  client = await createKey(app, 'enterprise');
});
afterAll(disconnect);

function createLink(body: object, key: TestKey = client) {
  return request(app).post('/v1/links').set(key.auth).send(body);
}

describe('links', () => {
  it('creates a link with a random 7-character code and a short URL', async () => {
    const res = await createLink({ targetUrl: 'https://example.com/page' }).expect(201);
    expect(res.body.data.code).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(res.body.data.shortUrl).toBe(`http://short.test/${res.body.data.code}`);
    expect(res.body.data).not.toHaveProperty('apiKeyId');
  });

  it('accepts a custom code and rejects a taken or reserved one', async () => {
    await createLink({ targetUrl: 'https://example.com', code: 'launch' }).expect(201);
    await createLink({ targetUrl: 'https://example.com', code: 'launch' }).expect(409);
    const reserved = await createLink({ targetUrl: 'https://example.com', code: 'docs' }).expect(
      400,
    );
    expect(reserved.body.error.details[0].message).toBe('this code is reserved');
  });

  it('only accepts http and https targets', async () => {
    await createLink({ targetUrl: 'javascript:alert(1)' }).expect(400);
    await createLink({ targetUrl: 'ftp://example.com/file' }).expect(400);
    await createLink({ targetUrl: 'http://example.com' }).expect(201);
  });

  it('rejects an expiry in the past', async () => {
    await createLink({
      targetUrl: 'https://example.com',
      expiresAt: '2001-01-01T00:00:00Z',
    }).expect(400);
  });

  it("keeps each client's links private", async () => {
    const other = await createKey(app, 'enterprise', 'other');
    const mine = await createLink({ targetUrl: 'https://example.com' }).expect(201);
    await createLink({ targetUrl: 'https://example.org' }, other).expect(201);

    const list = await request(app).get('/v1/links').set(client.auth).expect(200);
    expect(list.body.meta.total).toBe(1);
    await request(app).get(`/v1/links/${mine.body.data.id}`).set(other.auth).expect(404);
    await request(app).delete(`/v1/links/${mine.body.data.id}`).set(other.auth).expect(404);
  });
});

describe('redirects', () => {
  it('redirects with 302, and returns 404 for an unknown code', async () => {
    await createLink({ targetUrl: 'https://example.com/target', code: 'go-here' }).expect(201);
    const res = await request(app).get('/go-here').expect(302);
    expect(res.headers.location).toBe('https://example.com/target');
    await request(app).get('/no-such-code').expect(404);
  });

  it('returns 410 for an expired link', async () => {
    const link = await createLink({ targetUrl: 'https://example.com', code: 'old' }).expect(201);
    await getPrisma().link.update({
      where: { id: link.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app).get('/old').expect(410);
    expect(res.body.error.code).toBe('GONE');
  });

  it('serves a repeat redirect from Redis without reading Postgres', async () => {
    await createLink({ targetUrl: 'https://example.com/cached', code: 'cached' }).expect(201);
    await request(app).get('/cached').expect(302); // miss: loads from Postgres, fills the cache
    expect(await getRedis().get('link:cached')).not.toBeNull();

    // Remove the row behind the API's back: only the cache can answer now.
    await getPrisma().link.deleteMany({ where: { code: 'cached' } });
    const res = await request(app).get('/cached').expect(302);
    expect(res.headers.location).toBe('https://example.com/cached');
  });

  it('invalidates the cache when a link is updated or deleted', async () => {
    const link = await createLink({ targetUrl: 'https://example.com/v1', code: 'moving' }).expect(
      201,
    );
    await request(app).get('/moving').expect(302); // now cached

    await request(app)
      .patch(`/v1/links/${link.body.data.id}`)
      .set(client.auth)
      .send({ targetUrl: 'https://example.com/v2' })
      .expect(200);
    const after = await request(app).get('/moving').expect(302);
    expect(after.headers.location).toBe('https://example.com/v2');

    await request(app).delete(`/v1/links/${link.body.data.id}`).set(client.auth).expect(204);
    await request(app).get('/moving').expect(404);
  });

  it('is public and not rate limited', async () => {
    await createLink({ targetUrl: 'https://example.com', code: 'popular' }).expect(201);
    for (let i = 0; i < 20; i++) await request(app).get('/popular').expect(302);
  });
});
