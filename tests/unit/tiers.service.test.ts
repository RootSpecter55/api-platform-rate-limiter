import type { Db } from '../../src/common/db';
import { ConflictError } from '../../src/common/errors';
import { Prisma } from '../../src/generated/prisma/client';
import type { TierRepository } from '../../src/modules/tiers/tiers.repository';
import { TiersService } from '../../src/modules/tiers/tiers.service';
import { mockOf } from './fakes';

describe('TiersService', () => {
  let tiers: jest.Mocked<TierRepository>;
  let service: TiersService;

  beforeEach(() => {
    tiers = mockOf<TierRepository>('create', 'findById', 'countApiKeys', 'delete');
    service = new TiersService({} as Db, tiers);
  });

  it('turns a duplicate code into a conflict', async () => {
    tiers.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create({ code: 'free', name: 'Free', burst: 1, requestsPerMinute: 1 }),
    ).rejects.toThrow('Tier code "free" is taken');
  });

  it('will not delete a tier that API keys use', async () => {
    tiers.findById.mockResolvedValue({ id: 't1' } as never);
    tiers.countApiKeys.mockResolvedValue(3);
    await expect(service.delete('t1')).rejects.toBeInstanceOf(ConflictError);
    expect(tiers.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused tier', async () => {
    tiers.findById.mockResolvedValue({ id: 't1' } as never);
    tiers.countApiKeys.mockResolvedValue(0);
    await service.delete('t1');
    expect(tiers.delete).toHaveBeenCalledWith(expect.anything(), 't1');
  });
});
