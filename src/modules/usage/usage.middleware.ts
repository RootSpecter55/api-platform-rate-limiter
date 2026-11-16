import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { currentClient } from '../../common/auth-middleware';
import type { UsageService } from './usage.service';

/**
 * Counts every authenticated client request after the response is sent, so recording adds
 * no latency. Runs before the rate limiter so throttled (429) requests are counted too.
 */
export function createUsageRecorder(usage: UsageService, logger: Logger): RequestHandler {
  return (req, res, next) => {
    const { id } = currentClient(req);
    res.on('finish', () => {
      usage.record(id, res.statusCode === 429).catch((err: unknown) => {
        logger.warn({ err, apiKeyId: id }, 'Failed to record usage');
      });
    });
    next();
  };
}
