import { defineConfig } from 'vitest/config';

// Integration suite — opt-in. Requires a live local Supabase
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).
// The default `vitest.config.ts` excludes these files so `pnpm test`
// stays self-contained; CI's `supabase` job uses this config to run them.
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30_000,
  },
});
