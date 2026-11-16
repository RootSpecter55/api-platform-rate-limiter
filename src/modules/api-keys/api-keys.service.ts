import { createHash, randomBytes } from 'node:crypto';
import type { ApiClient } from '../../common/auth-middleware';
import type { Db } from '../../common/db';
import { ConflictError, NotFoundError } from '../../common/errors';
import { toPage, toSkipTake } from '../../common/pagination';
import type { ApiKey, Tier } from '../../generated/prisma/client';
import type { TierRepository } from '../tiers/tiers.repository';
import type { ApiKeyRepository } from './api-keys.repository';
import type { CreateApiKeyInput, ListApiKeysQuery, UpdateApiKeyInput } from './api-keys.schemas';

const KEY_PREFIX = 'sk_';
const PREFIX_LENGTH = KEY_PREFIX.length + 8;

/**
 * SHA-256 is enough here (no salt or slow hash): keys are 192 random bits, so they
 * cannot be guessed or brute-forced the way human passwords can.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey() {
  const key = KEY_PREFIX + randomBytes(24).toString('base64url');
  return { key, prefix: key.slice(0, PREFIX_LENGTH), keyHash: hashApiKey(key) };
}

type ApiKeyWithTier = ApiKey & { tier: Tier };

function toView({ keyHash: _omit, tierId: _tierId, tier, ...rest }: ApiKeyWithTier) {
  const { id, code, burst, requestsPerMinute } = tier;
  return { ...rest, tier: { id, code, burst, requestsPerMinute } };
}

export class ApiKeysService {
  constructor(
    private readonly db: Db,
    private readonly apiKeys: ApiKeyRepository,
    private readonly tiers: TierRepository,
  ) {}

  /** Returns the raw key once. Only its hash is stored. */
  async create(input: CreateApiKeyInput) {
    await this.requireTier(input.tierId);
    const { key, prefix, keyHash } = generateApiKey();
    const apiKey = await this.apiKeys.createWithTier(this.db, { ...input, prefix, keyHash });
    return { apiKey: toView(apiKey), key };
  }

  async list(query: ListApiKeysQuery) {
    const { items, total } = await this.apiKeys.listWithTier(this.db, toSkipTake(query));
    return toPage(items.map(toView), total, query);
  }

  async get(id: string) {
    const apiKey = await this.apiKeys.findByIdWithTier(this.db, id);
    if (!apiKey) throw new NotFoundError('API key');
    return toView(apiKey);
  }

  async update(id: string, input: UpdateApiKeyInput) {
    await this.get(id);
    if (input.tierId) await this.requireTier(input.tierId);
    return toView(await this.apiKeys.updateWithTier(this.db, id, input));
  }

  async revoke(id: string) {
    const apiKey = await this.get(id);
    if (apiKey.revokedAt) throw new ConflictError('API key is already revoked');
    return toView(await this.apiKeys.updateWithTier(this.db, id, { revokedAt: new Date() }));
  }

  /** Used by client auth: maps a raw key to its client, or null if unknown or revoked. */
  resolveClient = async (key: string): Promise<ApiClient | null> => {
    const apiKey = await this.apiKeys.findByHash(this.db, hashApiKey(key));
    if (!apiKey || apiKey.revokedAt) return null;
    const { code, burst, requestsPerMinute } = apiKey.tier;
    return { id: apiKey.id, name: apiKey.name, tier: { code, burst, requestsPerMinute } };
  };

  private async requireTier(tierId: string) {
    if (!(await this.tiers.findById(this.db, tierId))) throw new NotFoundError('Tier');
  }
}
