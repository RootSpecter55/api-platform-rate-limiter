import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { UnauthorizedError } from './errors';

/** The API key making the request, with the limits of its tier. */
export type ApiClient = {
  id: string;
  name: string;
  tier: { code: string; burst: number; requestsPerMinute: number };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      client?: ApiClient;
    }
  }
}

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

/** Turns an API key into a client. Supplied by the api-keys module. */
export type ResolveClient = (apiKey: string) => Promise<ApiClient | null>;

export function createClientAuth(resolveClient: ResolveClient): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req.headers.authorization);
    if (!token) return next(new UnauthorizedError('Missing API key'));
    const client = await resolveClient(token);
    if (!client) return next(new UnauthorizedError('Invalid or revoked API key'));
    req.client = client;
    next();
  };
}

/** The authenticated API client. Only call after client auth has run. */
export function currentClient(req: Express.Request): ApiClient {
  if (!req.client) throw new UnauthorizedError();
  return req.client;
}

/**
 * Admin routes use one shared key from config. Both values are hashed first so the
 * comparison is constant-time and length-independent.
 */
export function createAdminAuth(adminKey: string): RequestHandler {
  const expected = createHash('sha256').update(adminKey).digest();
  return (req, _res, next) => {
    const token = bearerToken(req.headers.authorization) ?? '';
    const given = createHash('sha256').update(token).digest();
    if (!timingSafeEqual(given, expected)) return next(new UnauthorizedError('Invalid admin key'));
    next();
  };
}
