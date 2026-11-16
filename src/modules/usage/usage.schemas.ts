import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';

export const usageQuery = paginationQuerySchema
  .extend({
    from: z.iso.date().optional().describe('First day, inclusive (YYYY-MM-DD, UTC)'),
    to: z.iso.date().optional().describe('Last day, inclusive (YYYY-MM-DD, UTC)'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, '`from` must not be after `to`');

export const apiKeyUsageParams = z.object({ id: z.uuid() });

/** Response shape, for the OpenAPI document. */
export const usageResponse = z.object({
  day: z.iso.date(),
  requests: z.number().describe('Requests that were allowed'),
  throttled: z.number().describe('Requests rejected with 429'),
});

export type UsageQuery = z.infer<typeof usageQuery>;
export type ApiKeyUsageParams = z.infer<typeof apiKeyUsageParams>;
