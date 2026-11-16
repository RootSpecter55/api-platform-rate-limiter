import type { Db } from '../../src/common/db';
import { ConflictError, NotFoundError } from '../../src/common/errors';
import type { ApiKey, Tier } from '../../src/generated/prisma/client';
import type { ApiKeyRepository } from '../../src/modules/api-keys/api-keys.repository';
import {
  ApiKeysService,
  generateApiKey,
  hashApiKey,
} from '../../src/modules/api-keys/api-keys.service';
import type { TierRepository } from '../../src/modules/tiers/tiers.repository';
import { mockOf } from './fakes';

const tier: Tier = {
  id: 'tier-1',
  code: 'free',
  name: 'Free',
  burst: 10,
  requestsPerMinute: 60,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function apiKey(overrides: Partial<ApiKey> = {}): ApiKey & { tier: Tier } {
  return {
    id: 'key-1',
    name: 'CLI',
    prefix: 'sk_abcdefgh',
    keyHash: 'hash',
    tierId: tier.id,
    revokedAt: null,
    createdAt: new Date(),
    tier,
    ...overrides,
  };
}

describe('generateApiKey', () => {
  it('creates a random key whose prefix and hash match it', () => {
    const { key, prefix, keyHash } = generateApiKey();
    expect(key).toMatch(/^sk_[A-Za-z0-9_-]{32}$/);
    expect(key.startsWith(prefix)).toBe(true);
    expect(keyHash).toBe(hashApiKey(key));
    expect(generateApiKey().key).not.toBe(key);
  });
});

describe('ApiKeysService', () => {
  let apiKeys: jest.Mocked<ApiKeyRepository>;
  let tiers: jest.Mocked<TierRepository>;
  let service: ApiKeysService;

  beforeEach(() => {
    apiKeys = mockOf<ApiKeyRepository>(
      'createWithTier',
      'findByHash',
      'findByIdWithTier',
      'updateWithTier',
    );
    tiers = mockOf<TierRepository>('findById');
    service = new ApiKeysService({} as Db, apiKeys, tiers);
  });

  it('stores the hash, never the key, and hides the hash in the response', async () => {
    tiers.findById.mockResolvedValue(tier);
    apiKeys.createWithTier.mockImplementation(async (_db, data) =>
      apiKey({ keyHash: data.keyHash as string, prefix: data.prefix as string }),
    );

    const { apiKey: view, key } = await service.create({ name: 'CLI', tierId: tier.id });

    const stored = apiKeys.createWithTier.mock.calls[0]![1];
    expect(stored.keyHash).toBe(hashApiKey(key));
    expect(JSON.stringify(stored)).not.toContain(key);
    expect(view).not.toHaveProperty('keyHash');
    expect(view.tier).toEqual({ id: 'tier-1', code: 'free', burst: 10, requestsPerMinute: 60 });
  });

  it('rejects an unknown tier', async () => {
    tiers.findById.mockResolvedValue(null);
    await expect(service.create({ name: 'x', tierId: 'nope' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('resolves a valid key to its client and tier limits, by hash', async () => {
    apiKeys.findByHash.mockResolvedValue(apiKey());
    await expect(service.resolveClient('sk_raw')).resolves.toEqual({
      id: 'key-1',
      name: 'CLI',
      tier: { code: 'free', burst: 10, requestsPerMinute: 60 },
    });
    expect(apiKeys.findByHash).toHaveBeenCalledWith(expect.anything(), hashApiKey('sk_raw'));
  });

  it('resolves unknown and revoked keys to null', async () => {
    apiKeys.findByHash.mockResolvedValue(null);
    await expect(service.resolveClient('sk_x')).resolves.toBeNull();
    apiKeys.findByHash.mockResolvedValue(apiKey({ revokedAt: new Date() }));
    await expect(service.resolveClient('sk_x')).resolves.toBeNull();
  });

  it('refuses to revoke a key twice', async () => {
    apiKeys.findByIdWithTier.mockResolvedValue(apiKey({ revokedAt: new Date() }));
    await expect(service.revoke('key-1')).rejects.toBeInstanceOf(ConflictError);
  });
});
