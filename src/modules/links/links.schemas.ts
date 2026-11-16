import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination';

/** Codes share the URL root with the API, so these paths cannot be used as custom codes. */
export const RESERVED_CODES = ['v1', 'docs', 'health'];

const code = z
  .string()
  .regex(/^[A-Za-z0-9_-]{3,32}$/, '3-32 letters, numbers, underscores or hyphens');

// Only http(s): rejects javascript:, data: and other schemes a redirect could abuse.
const targetUrl = z.url({ protocol: /^https?$/ }).max(2048);

const futureDate = z.iso
  .datetime()
  .refine((value) => new Date(value) > new Date(), 'must be in the future');

export const linkParams = z.object({ id: z.uuid() });
export const redirectParams = z.object({ code });

export const createLinkBody = z.object({
  targetUrl,
  code: code
    .refine((value) => !RESERVED_CODES.includes(value.toLowerCase()), 'this code is reserved')
    .optional(),
  expiresAt: futureDate.optional(),
});

// The code is the public URL, so it never changes; delete and recreate instead.
export const updateLinkBody = z
  .object({ targetUrl, expiresAt: futureDate.nullable() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

export const listLinksQuery = paginationQuerySchema;

/** Response shape, for the OpenAPI document. */
export const linkResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  shortUrl: z.url(),
  targetUrl: z.url(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type LinkParams = z.infer<typeof linkParams>;
export type RedirectParams = z.infer<typeof redirectParams>;
export type CreateLinkInput = z.infer<typeof createLinkBody>;
export type UpdateLinkInput = z.infer<typeof updateLinkBody>;
export type ListLinksQuery = z.infer<typeof listLinksQuery>;
