import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'rules',
          include: ['packages/rules/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'schemas',
          include: ['packages/schemas/test/**/*.test.ts', 'packages/content/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'backend',
          include: ['backend/**/*.test.ts'],
          exclude: ['**/node_modules/**'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      'frontend/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/rules/src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
