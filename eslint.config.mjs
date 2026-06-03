import tseslint from 'typescript-eslint';

export default tseslint.config(
  tseslint.configs.recommended,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'pnpm-lock.yaml',
      'packages/shared/src/database.types.ts',
    ],
  },
);
