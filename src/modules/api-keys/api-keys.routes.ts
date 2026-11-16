import { Router, type RequestHandler } from 'express';
import { addRoute, dataEnvelope, pageEnvelope, type OpenAPIRegistry } from '../../common/openapi';
import type { ApiKeysController } from './api-keys.controller';
import {
  apiKeyParams,
  apiKeyResponse,
  createApiKeyBody,
  createdApiKeyResponse,
  listApiKeysQuery,
  updateApiKeyBody,
} from './api-keys.schemas';

export const API_KEYS_PATH = '/v1/admin/api-keys';
export const CLIENT_KEY_PATH = '/v1/key';

export function apiKeysAdminRoutes(
  controller: ApiKeysController,
  adminAuth: RequestHandler,
  registry: OpenAPIRegistry,
): Router {
  const router = Router();
  router.use(adminAuth);
  const target = { router, registry, basePath: API_KEYS_PATH, tag: 'Admin: API keys' };
  const security = 'adminKey' as const;
  const one = dataEnvelope(apiKeyResponse);

  addRoute(
    target,
    {
      method: 'post',
      path: '/',
      summary: 'Create an API key (the key is returned once)',
      security,
      body: createApiKeyBody,
      response: {
        status: 201,
        description: 'Created',
        schema: dataEnvelope(createdApiKeyResponse),
      },
    },
    controller.create,
  );
  addRoute(
    target,
    {
      method: 'get',
      path: '/',
      summary: 'List API keys',
      security,
      query: listApiKeysQuery,
      response: { status: 200, description: 'API keys', schema: pageEnvelope(apiKeyResponse) },
    },
    controller.list,
  );
  addRoute(
    target,
    {
      method: 'get',
      path: '/:id',
      summary: 'Get an API key',
      security,
      params: apiKeyParams,
      response: { status: 200, description: 'API key', schema: one },
    },
    controller.get,
  );
  addRoute(
    target,
    {
      method: 'patch',
      path: '/:id',
      summary: 'Rename a key or move it to another tier',
      security,
      params: apiKeyParams,
      body: updateApiKeyBody,
      response: { status: 200, description: 'Updated', schema: one },
    },
    controller.update,
  );
  addRoute(
    target,
    {
      method: 'post',
      path: '/:id/revoke',
      summary: 'Revoke an API key; it stops working immediately',
      security,
      params: apiKeyParams,
      response: { status: 200, description: 'Revoked', schema: one },
    },
    controller.revoke,
  );
  return router;
}

/** Client-facing: GET /v1/key returns the caller's own key and tier limits. */
export function clientKeyRoutes(
  controller: ApiKeysController,
  clientChain: RequestHandler[],
  registry: OpenAPIRegistry,
): Router {
  const router = Router();
  router.use(...clientChain);
  addRoute(
    { router, registry, basePath: CLIENT_KEY_PATH, tag: 'Client' },
    {
      method: 'get',
      path: '/',
      summary: 'Your API key and its rate limits',
      security: 'apiKey',
      response: { status: 200, description: 'Your key', schema: dataEnvelope(apiKeyResponse) },
    },
    controller.me,
  );
  return router;
}
