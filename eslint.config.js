// Flat ESLint config (ESLint v9+) for the nyora TypeScript package.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'assets/**', 'docs/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // The runtime intentionally captures `this` to build the parser context
      // object passed into the OTA bundle; aliasing is deliberate here.
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
