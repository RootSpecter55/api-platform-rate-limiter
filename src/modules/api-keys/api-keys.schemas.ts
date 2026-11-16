import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';
import { tierResponse } from '../tiers/tiers.schemas';

export const apiKeyParams = z.object({ id: z.uuid() });

export const createApiKeyBody = z.object({
  name: z.string().trim().min(1).max(100),
  tierId: z.uuid(),
});

export const updateApiKeyBody = createApiKeyBody
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

export const listApiKeysQuery = paginationQuerySchema;

/** Response shapes, for the OpenAPI document. The hash is never returned. */
export const apiKeyResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string().describe('First characters of the key, to tell keys apart'),
  tier: tierResponse.pick({ id: true, code: true, burst: true, requestsPerMinute: true }),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const createdApiKeyResponse = z.object({
  apiKey: apiKeyResponse,
  key: z.string().describe('The full API key. Shown only once; store it now.'),
});

export type ApiKeyParams = z.infer<typeof apiKeyParams>;
export type CreateApiKeyInput = z.infer<typeof createApiKeyBody>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeyBody>;
export type ListApiKeysQuery = z.infer<typeof listApiKeysQuery>;
