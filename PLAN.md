# PLAN — api-platform-rate-limiter

A public API platform whose product is a URL shortener. Clients authenticate with API keys, every key belongs to a tier, and each tier has its own rate limit. The main mechanism is a **token-bucket rate limiter in Redis**, implemented as one atomic Lua script.

**Stack:** Node 24, TypeScript 5.9 (strict), Express 5, Prisma 7, Zod 4, ioredis, `@asteasolutions/zod-to-openapi` with swagger-ui-express, Jest 30 with Supertest, ESLint and Prettier, PostgreSQL 16, Redis 7.

## Who calls what

- **Admin:** a single `ADMIN_API_KEY` from env, used as `Authorization: Bearer …`. Manages tiers and API keys.
- **Clients:** `Authorization: Bearer <api key>`. Manage their own links and read their own usage. Every client request is rate limited and counted.
- **Public:** anyone can follow a short link (`GET /:code`).

## Modules

| Module   | Responsibility                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tiers    | Admin CRUD. A tier has a burst size (bucket capacity) and a sustained requests-per-minute rate. Deleting a tier that keys still use returns 409.                                                                               |
| api-keys | Admin create, list, get, update (name or tier) and revoke. The raw key is shown once. Only its SHA-256 hash is stored, plus a short prefix for display. Also provides `GET /v1/key`, where a client sees its own key and tier. |
| links    | Client CRUD on their own links (random or custom short code, target URL, optional expiry), plus the public redirect with a Redis cache.                                                                                        |
| usage    | Per-key daily counters of allowed and throttled requests. Clients read their own; admins read any key's.                                                                                                                       |

**Shared code (`src/common/`):** the same set as repo 1 (config, logger, errors and handler, validate, pagination, base repository, auth middleware, response helpers, Prisma singleton), plus:

- `redis.ts`: ioredis singleton
- `openapi.ts`: the OpenAPI registry and document builder
- `admin-auth.ts`: admin key check

**Patterns:**

- _Singleton:_ Prisma, Redis and config.
- _Repository:_ all Postgres access, and `LinkCache` for Redis.
- _Factory:_ not used, because there are no interchangeable providers in this repo.
- _Strategy:_ not used. Tiers differ only in their numbers (capacity and rate), so one algorithm with per-tier parameters is enough. Strategy objects would add indirection without changing behaviour.

## Data model

```
Tier        id, code (unique), name, burst (int), requestsPerMinute (int), createdAt, updatedAt
ApiKey      id, name, prefix, keyHash (unique), tierId → Tier, revokedAt?, createdAt
Link        id, apiKeyId → ApiKey, code (unique), targetUrl, expiresAt?, createdAt, updatedAt
UsageDaily  id, apiKeyId → ApiKey, day (date), requests (int), throttled (int)    unique(apiKeyId, day)
```

The seed adds three tiers:

| Tier       | Burst | Requests per minute |
| ---------- | ----- | ------------------- |
| free       | 10    | 60                  |
| pro        | 50    | 600                 |
| enterprise | 200   | 6,000               |

These are example values.

## Rate limiting (the main mechanism)

- One Redis hash per key, `rl:{apiKeyId}`, holding `tokens` and `ts` (the last refill time in ms).
- A Lua script, registered once through ioredis `defineCommand` and run with `EVALSHA`, does everything in one atomic step:
  1. Read the bucket.
  2. Refill: `tokens = min(capacity, tokens + elapsed × rate)`.
  3. Take one token if there is one.
  4. Write the bucket back and set a TTL.
  5. Return `[allowed, remaining, retryAfterMs]`.
- Because Redis runs a script without interleaving other commands, two app instances can't both spend the last token.
- The current time comes from Redis `TIME` inside the script, not the app server. Every instance then shares one clock, so clock skew between servers can't hand out extra tokens.
- Limits are read from the key's tier on each request, so a tier change applies immediately.
- Response headers: `RateLimit-Limit`, `RateLimit-Remaining`, and `Retry-After` on 429. A 429 uses the standard error envelope with code `RATE_LIMITED`.
- **If Redis is down, requests are let through** (fail-open) and the failure is logged. This trade-off favours availability and is documented in the README.
- **Tests:**
  - A real Redis allows exactly `burst` requests, then returns 429.
  - 50 concurrent requests against a burst of 10 get exactly 10 through, which proves the script is atomic.
  - Tokens refill over time (a high rate and a short real wait).

## Redirect cache

- `GET /:code` looks up `link:{code}` in Redis first. On a miss it reads Postgres and caches `{ targetUrl, expiresAt }`. The TTL is 5 minutes, or the time until the link expires if that's sooner.
- Updating or deleting a link deletes its cache entry (cache-aside with invalidation).
- A missing link returns 404, an expired one 410 Gone, and a valid one a 302 redirect.
- Target URLs must be `http`/`https`, so `javascript:` and other schemes are rejected.
- Custom codes can't use reserved words (`v1`, `docs`, `health`, `openapi.json`).

## Usage recording

After each authenticated `/v1` response, the middleware upserts that day's `UsageDaily` row for the key. It increments `requests`, or `throttled` if the response was a 429. Prisma's upsert maps to Postgres `INSERT … ON CONFLICT DO UPDATE`, so concurrent first writes don't collide. The write happens after the response is sent, so it adds no latency.

## OpenAPI

Each routes file registers its paths with the OpenAPI registry using **the same Zod schemas** passed to `validate()`, so the docs and validation can't drift apart. The spec is served at `GET /openapi.json` and in Swagger UI at `GET /docs`.

## Endpoints

```
GET    /health                      public
GET    /docs, /openapi.json         public
GET    /:code                       public: 302 / 404 / 410, cached in Redis

# admin (Bearer ADMIN_API_KEY)
POST   /v1/admin/tiers              GET /v1/admin/tiers
GET    /v1/admin/tiers/:id          PATCH, DELETE /v1/admin/tiers/:id
POST   /v1/admin/api-keys           returns the raw key once
GET    /v1/admin/api-keys           GET, PATCH /v1/admin/api-keys/:id
POST   /v1/admin/api-keys/:id/revoke
GET    /v1/admin/api-keys/:id/usage

# client (Bearer api key, rate limited, usage recorded)
GET    /v1/key                      own key and tier
POST   /v1/links                    GET /v1/links
GET    /v1/links/:id                PATCH, DELETE /v1/links/:id
GET    /v1/usage                    own daily usage, ?from=&to=
```

The same envelope and pagination rules as repo 1 apply: `{ data, meta? }` / `{ error: { code, message, details? } }`, and `?page=&pageSize=` on every list.

## Tests

- **Unit:** services with mocked repositories, API key generation and hashing, `start-with-secrets` with a mocked Secrets Manager client.
- **Integration:**
  - Main endpoints against real Postgres and Redis.
  - Rate limiter: exact burst, concurrency and refill.
  - Redirect cache: a hit is served while Postgres is untouched, an update invalidates the entry, and expired links return 410.
  - Usage counters for allowed and throttled requests.
  - The OpenAPI document contains every route.

## Deployment files

The same files as repo 1, kept as similar as possible:

- `Dockerfile`
- `scripts/start-with-secrets.ts` (the required secret keys are `DATABASE_URL`, `REDIS_URL`, `ADMIN_API_KEY`)
- `deploy/ecs-task-definition.json`
- `.github/workflows/deploy.yml` and `ci.yml`
- `.env.example`

Local ports: Postgres on host port **5441** and Redis on **6380** (5432, 5433, 5440 and 6379 are already used on this machine).

## Build order

1. Scaffold: tooling, docker-compose, CI
2. Common layer, Redis client, OpenAPI registry, `/health`, `/docs`
3. Prisma schema, migration, tier seed
4. tiers (admin)
5. api-keys and client auth
6. Rate limiter (Lua script and middleware)
7. links, redirect and cache
8. usage recording
9. Deployment files
10. README
