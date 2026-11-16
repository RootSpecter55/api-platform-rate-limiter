import { ConflictError, GoneError, NotFoundError } from '../../src/common/errors';
import type { Db } from '../../src/common/db';
import { Prisma, type Link } from '../../src/generated/prisma/client';
import type { LinkCache } from '../../src/modules/links/link.cache';
import type { LinkRepository } from '../../src/modules/links/links.repository';
import { LinksService, randomCode } from '../../src/modules/links/links.service';
import { mockOf } from './fakes';

const NOW = new Date('2026-06-01T12:00:00Z');

function link(overrides: Partial<Link> = {}): Link {
  return {
    id: 'link-1',
    apiKeyId: 'key-1',
    code: 'abc1234',
    targetUrl: 'https://example.com',
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('randomCode', () => {
  it('produces 7 base62 characters', () => {
    expect(randomCode()).toMatch(/^[A-Za-z0-9]{7}$/);
  });
});

describe('LinksService', () => {
  let links: jest.Mocked<LinkRepository>;
  let cache: jest.Mocked<LinkCache>;
  let service: LinksService;

  beforeEach(() => {
    links = mockOf<LinkRepository>('create', 'findByCode', 'findOwned', 'update', 'delete');
    cache = mockOf<LinkCache>('get', 'set', 'delete');
    // Deterministic codes, so the retry test can see which code each attempt used.
    const codes = ['first00', 'second0'];
    const nextCode = () => codes.shift() ?? 'fallbk0';
    service = new LinksService({} as Db, links, cache, 'http://s.test', nextCode);
  });

  describe('resolve', () => {
    it('answers from the cache without touching the repository', async () => {
      cache.get.mockResolvedValue({ targetUrl: 'https://cached.example', expiresAt: null });
      await expect(service.resolve('abc1234', NOW)).resolves.toBe('https://cached.example');
      expect(links.findByCode).not.toHaveBeenCalled();
    });

    it('loads from the repository on a miss and fills the cache', async () => {
      cache.get.mockResolvedValue(null);
      links.findByCode.mockResolvedValue(link());
      await expect(service.resolve('abc1234', NOW)).resolves.toBe('https://example.com');
      expect(cache.set).toHaveBeenCalledWith(
        'abc1234',
        { targetUrl: 'https://example.com', expiresAt: null },
        NOW,
      );
    });

    it('throws 404 for an unknown code and 410 for an expired link', async () => {
      cache.get.mockResolvedValue(null);
      links.findByCode.mockResolvedValue(null);
      await expect(service.resolve('nope', NOW)).rejects.toBeInstanceOf(NotFoundError);

      cache.get.mockResolvedValue({
        targetUrl: 'https://example.com',
        expiresAt: '2026-06-01T11:59:59Z',
      });
      await expect(service.resolve('abc1234', NOW)).rejects.toBeInstanceOf(GoneError);
    });
  });

  describe('create', () => {
    it('retries with a new random code when one collides', async () => {
      links.create.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce(link());
      await service.create('key-1', { targetUrl: 'https://example.com' });
      expect(links.create.mock.calls.map(([, data]) => data.code)).toEqual(['first00', 'second0']);
    });

    it('reports a taken custom code as a conflict instead of retrying', async () => {
      links.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create('key-1', { targetUrl: 'https://example.com', code: 'mine' }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(links.create).toHaveBeenCalledTimes(1);
    });
  });

  it('clears the cache entry when a link changes', async () => {
    links.findOwned.mockResolvedValue(link());
    links.update.mockResolvedValue(link({ targetUrl: 'https://new.example' }));
    await service.update('key-1', 'link-1', { targetUrl: 'https://new.example' });
    expect(cache.delete).toHaveBeenCalledWith('abc1234');
  });
});
