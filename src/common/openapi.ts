import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { RequestHandler, Router } from 'express';
import { z, type ZodObject, type ZodType } from 'zod';
import { validate } from './validate';

export { OpenAPIRegistry };

export function createRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'apiKey', {
    type: 'http',
    scheme: 'bearer',
    description: 'A client API key created by an admin',
  });
  registry.registerComponent('securitySchemes', 'adminKey', {
    type: 'http',
    scheme: 'bearer',
    description: 'The ADMIN_API_KEY from config',
  });
  return registry;
}

export function buildOpenApiDocument(registry: OpenAPIRegistry) {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'API Platform: URL shortener',
      version: '1.0.0',
      description: 'Client routes are rate limited per API key according to the key tier.',
    },
  });
}

// Response shapes, used only for documentation.
const errorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
const pageMeta = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});
export const dataEnvelope = <T extends ZodType>(schema: T) => z.object({ data: schema });
export const pageEnvelope = <T extends ZodType>(item: T) =>
  z.object({ data: z.array(item), meta: pageMeta });

export type RouteSpec = {
  method: 'get' | 'post' | 'patch' | 'delete';
  /** Express path relative to the router, e.g. '/:id'. */
  path: string;
  summary: string;
  security?: 'apiKey' | 'adminKey';
  params?: ZodObject;
  query?: ZodObject;
  body?: ZodType;
  response: { status: number; description: string; schema?: ZodType };
};

export type RouteTarget = {
  router: Router;
  registry: OpenAPIRegistry;
  basePath: string;
  tag: string;
};

/**
 * Registers an Express route and its OpenAPI operation from the same Zod schemas,
 * so the published docs always match what the API actually validates.
 */
export function addRoute(target: RouteTarget, spec: RouteSpec, ...handlers: RequestHandler[]) {
  const fullPath = `${target.basePath}${spec.path === '/' ? '' : spec.path}` || '/';
  const { status, description, schema } = spec.response;

  target.registry.registerPath({
    method: spec.method,
    path: fullPath.replace(/:(\w+)/g, '{$1}'),
    tags: [target.tag],
    summary: spec.summary,
    security: spec.security ? [{ [spec.security]: [] }] : undefined,
    request: {
      params: spec.params,
      query: spec.query,
      body: spec.body ? { content: { 'application/json': { schema: spec.body } } } : undefined,
    },
    responses: {
      [status]: {
        description,
        content: schema ? { 'application/json': { schema } } : undefined,
      },
      default: {
        description: 'Error',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  const validation = validate({ params: spec.params, query: spec.query, body: spec.body });
  target.router[spec.method](spec.path, validation, ...handlers);
}
