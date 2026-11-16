// Test environment: runs before every test file, before any app module reads config.
// Uses a separate database and Redis db index so tests never touch local development data.
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgresql://app:app@localhost:5441/api_platform_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/1',
  ADMIN_API_KEY: 'test-admin-key-that-is-at-least-32-characters',
  PUBLIC_BASE_URL: 'http://short.test',
  REDIRECT_CACHE_TTL_SECONDS: '300',
});
