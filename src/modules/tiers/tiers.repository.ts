import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Prisma, Tier } from '../../generated/prisma/client';

export class TierRepository extends BaseRepository<
  Tier,
  Prisma.TierUncheckedCreateInput,
  Prisma.TierUncheckedUpdateInput,
  Prisma.TierWhereInput
> {
  protected delegate(db: Db) {
    return db.tier;
  }

  findByCode(db: Db, code: string) {
    return db.tier.findUnique({ where: { code } });
  }

  countApiKeys(db: Db, tierId: string) {
    return db.apiKey.count({ where: { tierId } });
  }
}
