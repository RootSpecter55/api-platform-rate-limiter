import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { currentClient } from '../common/auth-middleware';
import { RateLimitedError } from '../common/errors';
import type { TokenBucket } from './token-bucket';

/**
 * Per-API-key rate limit using the key's tier. Runs after client auth.
 * If Redis is unavailable the request is allowed (fail-open) and the error is logged:
 * a Redis outage then degrades rate limiting instead of taking the whole API down.
 */
export function createRateLimit(bucket: TokenBucket, logger: Logger): RequestHandler {
  return async (req, res, next) => {
    const { id, tier } = currentClient(req);

    let result;
    try {
      result = await bucket.take(`rl:${id}`, tier.burst, tier.requestsPerMinute);
    } catch (err) {
      logger.warn({ err, apiKeyId: id }, 'Rate limiter unavailable; allowing request');
      return next();
    }

    res.set('RateLimit-Limit', String(tier.burst));
    res.set('RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return next(new RateLimitedError(retryAfterSeconds));
    }
    next();
  };
}
