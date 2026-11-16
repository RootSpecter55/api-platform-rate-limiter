import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { errorHandler, notFoundHandler } from './common/error-handler';
import { logger } from './common/logger';
import { buildOpenApiDocument, createRegistry } from './common/openapi';
import { sendData } from './common/response';
import { buildContainer, type Container } from './container';
import {
  API_KEYS_PATH,
  apiKeysAdminRoutes,
  CLIENT_KEY_PATH,
  clientKeyRoutes,
} from './modules/api-keys/api-keys.routes';
import { LINKS_PATH, linksRoutes, redirectRoutes } from './modules/links/links.routes';
import { TIERS_PATH, tiersRoutes } from './modules/tiers/tiers.routes';

export function createApp(container: Container = buildContainer()): Express {
  const { controllers: c, adminAuth, clientChain } = container;
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '100kb' }));

  // One registry per app: every route below registers its own OpenAPI entry.
  const registry = createRegistry();

  app.get('/health', (_req, res) => sendData(res, { status: 'ok' }));

  // Admin
  app.use(TIERS_PATH, tiersRoutes(c.tiers, adminAuth, registry));
  app.use(API_KEYS_PATH, apiKeysAdminRoutes(c.apiKeys, adminAuth, registry));

  // Client (API key, rate limited)
  app.use(CLIENT_KEY_PATH, clientKeyRoutes(c.apiKeys, clientChain, registry));
  app.use(LINKS_PATH, linksRoutes(c.links, clientChain, registry));

  // Public redirect: registered here so it appears in the docs, mounted last (catch-all path).
  const redirects = redirectRoutes(c.links, registry);

  // Built after all routes have registered.
  const openApiDocument = buildOpenApiDocument(registry);
  app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use(redirects);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
