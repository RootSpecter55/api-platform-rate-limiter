import { Redis } from 'ioredis';
import { getConfig } from './config';

// Singleton: one Redis connection shared by the rate limiter and the redirect cache.
let client: Redis | undefined;
export function getRedis(): Redis {
  client ??= new Redis(getConfig().REDIS_URL, {
    // If Redis is slow or down, fail a command quickly instead of queueing it indefinitely.
    // Callers decide what failure means (the rate limiter lets the request through).
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
  });
  return client;
}
