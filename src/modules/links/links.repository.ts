import { BaseRepository } from '../../common/base-repository';
import type { Db } from '../../common/db';
import type { Link, Prisma } from '../../generated/prisma/client';

export class LinkRepository extends BaseRepository<
  Link,
  Prisma.LinkUncheckedCreateInput,
  Prisma.LinkUncheckedUpdateInput,
  Prisma.LinkWhereInput
> {
  protected delegate(db: Db) {
    return db.link;
  }

  findByCode(db: Db, code: string) {
    return db.link.findUnique({ where: { code } });
  }

  /** A link only if it belongs to this API key, so clients cannot reach each other's links. */
  findOwned(db: Db, id: string, apiKeyId: string) {
    return db.link.findFirst({ where: { id, apiKeyId } });
  }
}
