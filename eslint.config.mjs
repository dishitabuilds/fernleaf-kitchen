import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/generated/**', '**/next-env.d.ts', '**/*.tsbuildinfo', '.tooling/**', '.local/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) => ({ ...config, files: ['apps/web/**/*.{js,jsx,ts,tsx,mjs}'] })),
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
  { files: ['apps/web/**/*.{js,jsx,ts,tsx,mjs}'], settings: { next: { rootDir: 'apps/web/' } } },
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-explicit-any': 'error' } }
);
