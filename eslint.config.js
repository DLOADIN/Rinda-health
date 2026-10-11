import js from '@eslint/js';
import i18next from 'eslint-plugin-i18next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      'backend/db/**',
      '.*/**',
      'Badget-main/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.mjs', '**/*.config.{js,ts}', 'backend/**/*.ts', 'packages/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['backend/server.ts'],
    rules: { 'no-console': ['error', { allow: ['log', 'error'] }] },
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    files: ['frontend/src/**/*.tsx'],
    ignores: ['frontend/src/components/ui/**', 'frontend/src/**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-text-only',
          callees: {
            exclude: [
              't',
              'text',
              'i18n(ext)?',
              'require',
              'addEventListener',
              'removeEventListener',
              'postMessage',
              'getElementById',
              'dispatch',
              'commit',
              'includes',
              'indexOf',
              'endsWith',
              'startsWith',
            ],
          },
          'jsx-attributes': { include: ['aria-label', 'title', 'alt', 'placeholder'] },
        },
      ],
    },
  },
  {
    files: ['frontend/src/components/ui/**'],
    rules: Object.fromEntries(
      [...Object.keys(jsxA11y.flatConfigs.recommended.rules), 'react-hooks/purity'].map((r) => [r, 'off']),
    ),
  },
);
