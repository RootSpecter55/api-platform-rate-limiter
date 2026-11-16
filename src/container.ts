import { createAdminAuth } from './common/auth-middleware';
import { getConfig } from './common/config';
import { getPrisma } from './common/db';
import { TiersController } from './modules/tiers/tiers.controller';
import { TierRepository } from './modules/tiers/tiers.repository';
import { TiersService } from './modules/tiers/tiers.service';

/** Composition root: builds every repository, service and controller in one place. */
export function buildContainer() {
  const config = getConfig();
  const db = getPrisma();

  const repos = {
    tiers: new TierRepository(),
  };

  const tiersService = new TiersService(db, repos.tiers);

  return {
    adminAuth: createAdminAuth(config.ADMIN_API_KEY),
    controllers: {
      tiers: new TiersController(tiersService),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
