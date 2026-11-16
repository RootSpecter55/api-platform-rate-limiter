import { randomInt } from 'node:crypto';
import { isUniqueViolation, type Db } from '../../common/db';
import { AppError, ConflictError, GoneError, NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import type { Link } from '../../generated/prisma/client';
import type { LinkCache } from './link.cache';
import type { LinkRepository } from './links.repository';
import type { CreateLinkInput, ListLinksQuery, UpdateLinkInput } from './links.schemas';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const RANDOM_CODE_LENGTH = 7; // 62^7 ≈ 3.5 trillion codes
const MAX_CODE_ATTEMPTS = 5;

export function randomCode(): string {
  let code = '';
  for (let i = 0; i < RANDOM_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** undefined = leave unchanged, null = remove the expiry, string = new expiry. */
function toExpiry(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) return value;
  return new Date(value);
}

export class LinksService {
  constructor(
    private readonly db: Db,
    private readonly links: LinkRepository,
    private readonly cache: LinkCache,
    private readonly publicBaseUrl: string,
    private readonly generateCode: () => string = randomCode,
  ) {}

  private toView(link: Link) {
    const { apiKeyId: _omit, ...rest } = link;
    return { ...rest, shortUrl: `${this.publicBaseUrl}/${link.code}` };
  }

  async create(apiKeyId: string, input: CreateLinkInput) {
    const data = {
      apiKeyId,
      targetUrl: input.targetUrl,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    };

    if (input.code) {
      try {
        return this.toView(await this.links.create(this.db, { ...data, code: input.code }));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`Code "${input.code}" is taken`);
        throw err;
      }
    }

    // Random codes rarely collide; on a collision the unique index rejects it and we retry.
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        return this.toView(
          await this.links.create(this.db, { ...data, code: this.generateCode() }),
        );
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new AppError(500, 'CODE_GENERATION_FAILED', 'Could not generate a unique code');
  }

  async list(apiKeyId: string, query: ListLinksQuery) {
    const { items, total } = await this.links.list(this.db, {
      where: { apiKeyId },
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
    });
    return toPage(
      items.map((link) => this.toView(link)),
      total,
      query,
    );
  }

  async get(apiKeyId: string, id: string) {
    return this.toView(await this.requireOwned(apiKeyId, id));
  }

  async update(apiKeyId: string, id: string, input: UpdateLinkInput) {
    const link = await this.requireOwned(apiKeyId, id);
    const updated = await this.links.update(this.db, id, {
      targetUrl: input.targetUrl,
      expiresAt: toExpiry(input.expiresAt),
    });
    await this.cache.delete(link.code);
    return this.toView(updated);
  }

  async delete(apiKeyId: string, id: string) {
    const link = await this.requireOwned(apiKeyId, id);
    await this.links.delete(this.db, id);
    await this.cache.delete(link.code);
  }

  /** Redirect lookup: Redis first, Postgres on a miss. Throws 404 or 410. */
  async resolve(code: string, now = new Date()): Promise<string> {
    let link = await this.cache.get(code);
    if (!link) {
      const row = await this.links.findByCode(this.db, code);
      if (!row) throw new NotFoundError('Link');
      link = { targetUrl: row.targetUrl, expiresAt: row.expiresAt?.toISOString() ?? null };
      await this.cache.set(code, link, now);
    }
    if (link.expiresAt && new Date(link.expiresAt) <= now) {
      throw new GoneError('This link has expired');
    }
    return link.targetUrl;
  }

  private async requireOwned(apiKeyId: string, id: string) {
    const link = await this.links.findOwned(this.db, id, apiKeyId);
    if (!link) throw new NotFoundError('Link');
    return link;
  }
}
