import { Router, type RequestHandler } from 'express';
import { addRoute, pageEnvelope, type OpenAPIRegistry } from '../../common/openapi';
import type { UsageController } from './usage.controller';
import { apiKeyUsageParams, usageQuery, usageResponse } from './usage.schemas';

export const USAGE_PATH = '/v1/usage';
export const ADMIN_USAGE_PATH = '/v1/admin/api-keys/:id/usage';

export function usageRoutes(
  controller: UsageController,
  clientChain: RequestHandler[],
  registry: OpenAPIRegistry,
): Router {
  const router = Router();
  router.use(...clientChain);
  addRoute(
    { router, registry, basePath: USAGE_PATH, tag: 'Client' },
    {
      method: 'get',
      path: '/',
      summary: 'Your daily request counts, newest first',
      security: 'apiKey',
      query: usageQuery,
      response: { status: 200, description: 'Usage', schema: pageEnvelope(usageResponse) },
    },
    controller.mine,
  );
  return router;
}

export function adminUsageRoutes(
  controller: UsageController,
  adminAuth: RequestHandler,
  registry: OpenAPIRegistry,
): Router {
  const router = Router({ mergeParams: true });
  router.use(adminAuth);
  addRoute(
    { router, registry, basePath: ADMIN_USAGE_PATH, tag: 'Admin: API keys' },
    {
      method: 'get',
      path: '/',
      summary: "An API key's daily request counts",
      security: 'adminKey',
      params: apiKeyUsageParams,
      query: usageQuery,
      response: { status: 200, description: 'Usage', schema: pageEnvelope(usageResponse) },
    },
    controller.forKey,
  );
  return router;
}
