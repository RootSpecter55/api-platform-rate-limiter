import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { errorHandler, notFoundHandler } from './common/error-handler';
import { logger } from './common/logger';
import { buildOpenApiDocument, createRegistry } from './common/openapi';
import { sendData } from './common/response';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '100kb' }));

  const registry = createRegistry();

  app.get('/health', (_req, res) => sendData(res, { status: 'ok' }));

  const openApiDocument = buildOpenApiDocument(registry);
  app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
