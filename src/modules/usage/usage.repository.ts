import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Prisma, UsageDaily } from '../../generated/prisma/client';

export class UsageRepository extends BaseRepository<
  UsageDaily,
  Prisma.UsageDailyUncheckedCreateInput,
  Prisma.UsageDailyUncheckedUpdateInput,
  Prisma.UsageDailyWhereInput
> {
  protected delegate(db: Db) {
    return db.usageDaily;
  }

  /**
   * Adds one to today's counter. Prisma runs this as INSERT ... ON CONFLICT DO UPDATE,
   * so two requests creating the day's row at the same time cannot collide.
   */
  increment(db: Db, apiKeyId: string, day: Date, field: 'requests' | 'throttled') {
    return db.usageDaily.upsert({
      where: { apiKeyId_day: { apiKeyId, day } },
      create: { apiKeyId, day, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  }
}
