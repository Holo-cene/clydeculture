import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests require a live local Supabase instance. Exclude them from
    // the default run so CI and `pnpm test` don't fail without Supabase env vars.
    // Run them separately with: vitest run --include '**/*.integration.test.ts'
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text', 'lcov'],
      // Start at 0 — raise to 80 once the first module implementation is complete.
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
  },
});
