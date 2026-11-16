import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';

export const tierParams = z.object({ id: z.uuid() });

export const createTierBody = z.object({
  code: z.string().regex(/^[a-z0-9-]{2,32}$/, 'lowercase letters, numbers and hyphens'),
  name: z.string().trim().min(1).max(100),
  burst: z.number().int().min(1).max(100_000),
  requestsPerMinute: z.number().int().min(1).max(1_000_000),
});

// The code is the tier's stable identifier, so it cannot be changed.
export const updateTierBody = createTierBody
  .omit({ code: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

export const listTiersQuery = paginationQuerySchema;

/** Response shape, for the OpenAPI document. */
export const tierResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  burst: z.number(),
  requestsPerMinute: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type TierParams = z.infer<typeof tierParams>;
export type CreateTierInput = z.infer<typeof createTierBody>;
export type UpdateTierInput = z.infer<typeof updateTierBody>;
export type ListTiersQuery = z.infer<typeof listTiersQuery>;
