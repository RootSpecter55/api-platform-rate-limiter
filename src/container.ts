import type { RequestHandler } from 'express';
import { createAdminAuth, createClientAuth } from './common/auth-middleware';
import { getConfig } from './common/config';
import { getPrisma } from './common/db';
import { logger } from './common/logger';
import { getRedis } from './common/redis';
import { ApiKeysController } from './modules/api-keys/api-keys.controller';
import { ApiKeyRepository } from './modules/api-keys/api-keys.repository';
import { ApiKeysService } from './modules/api-keys/api-keys.service';
import { TiersController } from './modules/tiers/tiers.controller';
import { TierRepository } from './modules/tiers/tiers.repository';
import { TiersService } from './modules/tiers/tiers.service';
import { createRateLimit } from './rate-limiter/rate-limit.middleware';
import { TokenBucket } from './rate-limiter/token-bucket';

/** Composition root: builds every repository, service and controller in one place. */
export function buildContainer() {
  const config = getConfig();
  const db = getPrisma();
  const redis = getRedis();

  const repos = {
    tiers: new TierRepository(),
    apiKeys: new ApiKeyRepository(),
  };

  const tiersService = new TiersService(db, repos.tiers);
  const apiKeysService = new ApiKeysService(db, repos.apiKeys, repos.tiers);

  // Runs in this order on every client (/v1, non-admin) request.
  const clientChain: RequestHandler[] = [
    createClientAuth(apiKeysService.resolveClient),
    createRateLimit(new TokenBucket(redis), logger),
  ];

  return {
    adminAuth: createAdminAuth(config.ADMIN_API_KEY),
    clientChain,
    controllers: {
      tiers: new TiersController(tiersService),
      apiKeys: new ApiKeysController(apiKeysService),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
