import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { ApiKey, Prisma } from '../../generated/prisma/client';

const withTier = { tier: true } as const;

export class ApiKeyRepository extends BaseRepository<
  ApiKey,
  Prisma.ApiKeyUncheckedCreateInput,
  Prisma.ApiKeyUncheckedUpdateInput,
  Prisma.ApiKeyWhereInput
> {
  protected delegate(db: Db) {
    return db.apiKey;
  }

  async findByHash(db: Db, keyHash: string) {
    return db.apiKey.findUnique({ where: { keyHash }, include: withTier });
  }

  async findByIdWithTier(db: Db, id: string) {
    return db.apiKey.findUnique({ where: { id }, include: withTier });
  }

  async listWithTier(db: Db, { skip, take }: { skip: number; take: number }) {
    const items = await db.apiKey.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: withTier,
    });
    const total = await db.apiKey.count();
    return { items, total };
  }

  async createWithTier(db: Db, data: Prisma.ApiKeyUncheckedCreateInput) {
    return db.apiKey.create({ data, include: withTier });
  }

  async updateWithTier(db: Db, id: string, data: Prisma.ApiKeyUncheckedUpdateInput) {
    return db.apiKey.update({ where: { id }, data, include: withTier });
  }
}
