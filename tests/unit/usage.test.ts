import type { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import type { Db } from '../../src/common/db';
import type { ApiKeyRepository } from '../../src/modules/api-keys/api-keys.repository';
import { createUsageRecorder } from '../../src/modules/usage/usage.middleware';
import type { UsageRepository } from '../../src/modules/usage/usage.repository';
import { UsageService, utcDay } from '../../src/modules/usage/usage.service';
import { mockOf } from './fakes';

describe('utcDay', () => {
  it('truncates to midnight UTC regardless of the time of day', () => {
    expect(utcDay(new Date('2026-05-31T23:59:59Z')).toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });
});

describe('UsageService.record', () => {
  it('increments the throttled counter for 429s and the requests counter otherwise', async () => {
    const usage = mockOf<UsageRepository>('increment');
    const service = new UsageService({} as Db, usage, mockOf<ApiKeyRepository>());
    const at = new Date('2026-05-31T15:00:00Z');

    await service.record('key-1', false, at);
    await service.record('key-1', true, at);

    expect(
      usage.increment.mock.calls.map(([, , day, field]) => [day.toISOString(), field]),
    ).toEqual([
      ['2026-05-31T00:00:00.000Z', 'requests'],
      ['2026-05-31T00:00:00.000Z', 'throttled'],
    ]);
  });
});

describe('usage recorder middleware', () => {
  it('records only once the response has finished, using the final status code', async () => {
    const service = mockOf<UsageService>('record');
    service.record.mockResolvedValue();
    const middleware = createUsageRecorder(service, pino({ level: 'silent' }));
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    const next = jest.fn();

    const req = { client: { id: 'key-1', name: 'x', tier: {} } } as unknown as Request;
    middleware(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalled();
    expect(service.record).not.toHaveBeenCalled();

    res.statusCode = 429;
    res.emit('finish');
    expect(service.record).toHaveBeenCalledWith('key-1', true);
  });
});
