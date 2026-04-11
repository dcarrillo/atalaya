import oxlint from 'eslint-plugin-oxlint';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['status-page/**', 'node_modules/**', 'dist/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
  },
  {
    files: ['src/**/*.test.ts', 'src/**/test-*.ts', 'src/**/*.spec.ts'],
    rules: {
      'cloudflare-worker/no-hardcoded-secrets': 'off',
      'cloudflare-worker/env-var-validation': 'off',
    },
  },
  {
    files: ['src/utils/interpolate.ts'],
    rules: {
      'cloudflare-worker/env-var-validation': 'off',
    },
  },
  ...oxlint.configs['flat/all'],
];
