import { Router, type RequestHandler } from 'express';
import { addRoute, dataEnvelope, pageEnvelope, type OpenAPIRegistry } from '../../common/openapi';
import type { LinksController } from './links.controller';
import {
  createLinkBody,
  linkParams,
  linkResponse,
  listLinksQuery,
  redirectParams,
  updateLinkBody,
} from './links.schemas';

export const LINKS_PATH = '/v1/links';

export function linksRoutes(
  controller: LinksController,
  clientChain: RequestHandler[],
  registry: OpenAPIRegistry,
): Router {
  const router = Router();
  router.use(...clientChain);
  const target = { router, registry, basePath: LINKS_PATH, tag: 'Client: links' };
  const security = 'apiKey' as const;
  const one = dataEnvelope(linkResponse);

  addRoute(
    target,
    {
      method: 'post',
      path: '/',
      summary: 'Create a short link (random code unless you pass one)',
      security,
      body: createLinkBody,
      response: { status: 201, description: 'Created', schema: one },
    },
    controller.create,
  );
  addRoute(
    target,
    {
      method: 'get',
      path: '/',
      summary: 'List your links, newest first',
      security,
      query: listLinksQuery,
      response: { status: 200, description: 'Links', schema: pageEnvelope(linkResponse) },
    },
    controller.list,
  );
  addRoute(
    target,
    {
      method: 'get',
      path: '/:id',
      summary: 'Get one of your links',
      security,
      params: linkParams,
      response: { status: 200, description: 'Link', schema: one },
    },
    controller.get,
  );
  addRoute(
    target,
    {
      method: 'patch',
      path: '/:id',
      summary: 'Change the target or expiry (clears the redirect cache)',
      security,
      params: linkParams,
      body: updateLinkBody,
      response: { status: 200, description: 'Updated', schema: one },
    },
    controller.update,
  );
  addRoute(
    target,
    {
      method: 'delete',
      path: '/:id',
      summary: 'Delete a link (clears the redirect cache)',
      security,
      params: linkParams,
      response: { status: 204, description: 'Deleted' },
    },
    controller.delete,
  );
  return router;
}

/** Public short-link redirect, mounted at the root after every other route. */
export function redirectRoutes(controller: LinksController, registry: OpenAPIRegistry): Router {
  const router = Router();
  addRoute(
    { router, registry, basePath: '', tag: 'Public' },
    {
      method: 'get',
      path: '/:code',
      summary: 'Follow a short link (404 unknown, 410 expired)',
      params: redirectParams,
      response: { status: 302, description: 'Redirect to the target URL' },
    },
    controller.redirect,
  );
  return router;
}
