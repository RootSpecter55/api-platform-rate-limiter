import { Router, type RequestHandler } from 'express';
import { addRoute, dataEnvelope, pageEnvelope, type OpenAPIRegistry } from '../../common/openapi';
import type { TiersController } from './tiers.controller';
import {
  createTierBody,
  listTiersQuery,
  tierParams,
  tierResponse,
  updateTierBody,
} from './tiers.schemas';

export const TIERS_PATH = '/v1/admin/tiers';

export function tiersRoutes(
  controller: TiersController,
  adminAuth: RequestHandler,
  registry: OpenAPIRegistry,
): Router {
  const router = Router();
  router.use(adminAuth);
  const target = { router, registry, basePath: TIERS_PATH, tag: 'Admin: tiers' };
  const security = 'adminKey' as const;

  addRoute(
    target,
    {
      method: 'get',
      path: '/',
      summary: 'List tiers',
      security,
      query: listTiersQuery,
      response: { status: 200, description: 'Tiers', schema: pageEnvelope(tierResponse) },
    },
    controller.list,
  );
  addRoute(
    target,
    {
      method: 'post',
      path: '/',
      summary: 'Create a tier',
      security,
      body: createTierBody,
      response: { status: 201, description: 'Created', schema: dataEnvelope(tierResponse) },
    },
    controller.create,
  );
  addRoute(
    target,
    {
      method: 'get',
      path: '/:id',
      summary: 'Get a tier',
      security,
      params: tierParams,
      response: { status: 200, description: 'Tier', schema: dataEnvelope(tierResponse) },
    },
    controller.get,
  );
  addRoute(
    target,
    {
      method: 'patch',
      path: '/:id',
      summary: 'Update a tier; new limits apply to the next request',
      security,
      params: tierParams,
      body: updateTierBody,
      response: { status: 200, description: 'Updated', schema: dataEnvelope(tierResponse) },
    },
    controller.update,
  );
  addRoute(
    target,
    {
      method: 'delete',
      path: '/:id',
      summary: 'Delete a tier that no API key uses',
      security,
      params: tierParams,
      response: { status: 204, description: 'Deleted' },
    },
    controller.delete,
  );
  return router;
}
