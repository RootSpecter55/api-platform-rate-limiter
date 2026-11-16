import type { Db } from '../../common/db';
import { NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import type { UsageDaily } from '../../generated/prisma/client';
import type { ApiKeyRepository } from '../api-keys/api-keys.repository';
import type { UsageRepository } from './usage.repository';
import type { UsageQuery } from './usage.schemas';

/** Midnight UTC of the given time: the key for that day's counter row. */
export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toView(row: UsageDaily) {
  return {
    day: row.day.toISOString().slice(0, 10),
    requests: row.requests,
    throttled: row.throttled,
  };
}

export class UsageService {
  constructor(
    private readonly db: Db,
    private readonly usage: UsageRepository,
    private readonly apiKeys: ApiKeyRepository,
  ) {}

  async record(apiKeyId: string, throttled: boolean, now = new Date()): Promise<void> {
    await this.usage.increment(
      this.db,
      apiKeyId,
      utcDay(now),
      throttled ? 'throttled' : 'requests',
    );
  }

  /** Daily rows for one key, newest first, optionally within [from, to]. */
  async list(apiKeyId: string, query: UsageQuery) {
    const day = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const { items, total } = await this.usage.list(this.db, {
      where: { apiKeyId, day },
      orderBy: { day: 'desc' },
      ...toSkipTake(query),
    });
    return toPage(items.map(toView), total, query);
  }

  /** Admin view of any key's usage. */
  async listForKey(apiKeyId: string, query: UsageQuery) {
    if (!(await this.apiKeys.findById(this.db, apiKeyId))) throw new NotFoundError('API key');
    return this.list(apiKeyId, query);
  }
}
