import request from 'supertest';
import { createApp } from '../../src/app';
import { disconnect } from './helpers';

const app = createApp();
afterAll(disconnect);

describe('OpenAPI document', () => {
  it('lists every route, generated from the validation schemas', async () => {
    const res = await request(app).get('/openapi.json').expect(200);
    const operations = Object.entries(res.body.paths as Record<string, object>).flatMap(
      ([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(operations.sort()).toEqual(
      [
        'GET /v1/admin/tiers',
        'POST /v1/admin/tiers',
        'GET /v1/admin/tiers/{id}',
        'PATCH /v1/admin/tiers/{id}',
        'DELETE /v1/admin/tiers/{id}',
        'POST /v1/admin/api-keys',
        'GET /v1/admin/api-keys',
        'GET /v1/admin/api-keys/{id}',
        'PATCH /v1/admin/api-keys/{id}',
        'POST /v1/admin/api-keys/{id}/revoke',
        'GET /v1/admin/api-keys/{id}/usage',
        'GET /v1/key',
        'POST /v1/links',
        'GET /v1/links',
        'GET /v1/links/{id}',
        'PATCH /v1/links/{id}',
        'DELETE /v1/links/{id}',
        'GET /v1/usage',
        'GET /{code}',
      ].sort(),
    );
  });

  it('carries the validation rules into the request schemas', async () => {
    const res = await request(app).get('/openapi.json').expect(200);
    const body =
      res.body.paths['/v1/admin/tiers'].post.requestBody.content['application/json'].schema;
    expect(body.required).toEqual(['code', 'name', 'burst', 'requestsPerMinute']);
    expect(body.properties.burst).toMatchObject({ type: 'integer', minimum: 1 });
  });

  it('serves Swagger UI', async () => {
    const res = await request(app).get('/docs/').expect(200);
    expect(res.text).toContain('swagger-ui');
  });
});
