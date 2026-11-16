import { isUniqueViolation, type Db } from '../../common/db';
import { ConflictError, NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import type { TierRepository } from './tiers.repository';
import type { CreateTierInput, ListTiersQuery, UpdateTierInput } from './tiers.schemas';

export class TiersService {
  constructor(
    private readonly db: Db,
    private readonly tiers: TierRepository,
  ) {}

  async list(query: ListTiersQuery) {
    const { items, total } = await this.tiers.list(this.db, {
      ...toSkipTake(query),
      orderBy: { burst: 'asc' },
    });
    return toPage(items, total, query);
  }

  async get(id: string) {
    const tier = await this.tiers.findById(this.db, id);
    if (!tier) throw new NotFoundError('Tier');
    return tier;
  }

  async create(input: CreateTierInput) {
    try {
      return await this.tiers.create(this.db, input);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError(`Tier code "${input.code}" is taken`);
      throw err;
    }
  }

  async update(id: string, input: UpdateTierInput) {
    await this.get(id);
    return this.tiers.update(this.db, id, input);
  }

  async delete(id: string) {
    await this.get(id);
    const keys = await this.tiers.countApiKeys(this.db, id);
    if (keys > 0) throw new ConflictError(`Tier is used by ${keys} API key(s); move them first`);
    await this.tiers.delete(this.db, id);
  }
}
