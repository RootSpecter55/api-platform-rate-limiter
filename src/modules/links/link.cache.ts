import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

/** What a redirect needs. Kept small so a cache hit never touches Postgres. */
export type CachedLink = { targetUrl: string; expiresAt: string | null };

/**
 * Cache-aside store for redirect lookups, keyed by short code.
 * Errors are logged and treated as a miss: if Redis is down, redirects fall back to Postgres.
 */
export class LinkCache {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
    private readonly logger: Logger,
  ) {}

  private key(code: string) {
    return `link:${code}`;
  }

  async get(code: string): Promise<CachedLink | null> {
    try {
      const value = await this.redis.get(this.key(code));
      return value ? (JSON.parse(value) as CachedLink) : null;
    } catch (err) {
      this.logger.warn({ err, code }, 'Link cache read failed');
      return null;
    }
  }

  /** Caches until the normal TTL or the link's expiry, whichever comes first. */
  async set(code: string, link: CachedLink, now = new Date()): Promise<void> {
    let ttl = this.ttlSeconds;
    if (link.expiresAt) {
      ttl = Math.min(ttl, Math.floor((new Date(link.expiresAt).getTime() - now.getTime()) / 1000));
    }
    if (ttl <= 0) return;
    try {
      await this.redis.set(this.key(code), JSON.stringify(link), 'EX', ttl);
    } catch (err) {
      this.logger.warn({ err, code }, 'Link cache write failed');
    }
  }

  async delete(code: string): Promise<void> {
    try {
      await this.redis.del(this.key(code));
    } catch (err) {
      // The entry will still expire on its TTL; until then the old target may be served.
      this.logger.warn({ err, code }, 'Link cache invalidation failed');
    }
  }
}
