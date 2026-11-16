import { loadConfig } from '../../src/common/config';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  ADMIN_API_KEY: 'x'.repeat(32),
  PUBLIC_BASE_URL: 'https://sho.rt',
};

describe('loadConfig', () => {
  it('applies defaults to a minimal valid environment', () => {
    expect(loadConfig(base)).toMatchObject({ PORT: 3000, REDIRECT_CACHE_TTL_SECONDS: 300 });
  });

  it('lists every missing or invalid variable in one error', () => {
    try {
      loadConfig({ ADMIN_API_KEY: 'too-short' });
      throw new Error('expected loadConfig to throw');
    } catch (err) {
      const message = (err as Error).message;
      for (const key of ['DATABASE_URL', 'REDIS_URL', 'ADMIN_API_KEY', 'PUBLIC_BASE_URL']) {
        expect(message).toContain(`- ${key}:`);
      }
    }
  });
});
