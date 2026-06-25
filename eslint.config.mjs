import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  unicorn.configs['flat/recommended'],
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Advisory: most sites are guaranteed-present Node stdio streams / post-mount DOM refs where
      // a non-null assertion is idiomatic. Kept as a warning so new ones get a second look.
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'unicorn/max-nested-calls': 'off',
      'unicorn/no-top-level-assignment-in-function': 'warn',
      'unicorn/name-replacements': 'warn',
      'unicorn/no-null': 'warn',
      'unicorn/import-style': 'warn',
      'unicorn/require-array-sort-compare': 'warn',
      'unicorn/consistent-boolean-name': 'warn',
      'unicorn/text-encoding-identifier-case': 'warn',
      'unicorn/no-return-array-push': 'warn',
      'unicorn/filename-case': 'warn',
      'unicorn/prefer-number-coercion': 'warn',
      'unicorn/consistent-function-scoping': 'warn',
      'unicorn/no-unreadable-array-destructuring': 'warn',
      'unicorn/no-process-exit': 'warn',
      'unicorn/no-declarations-before-early-exit': 'warn',
      'unicorn/no-break-in-nested-loop': 'warn',
      'unicorn/no-await-expression-member': 'warn',
      'unicorn/consistent-class-member-order': 'warn',
      'unicorn/prefer-ternary': 'warn',
      'unicorn/prefer-iterator-to-array': 'warn',
      'unicorn/no-top-level-side-effects': 'warn',
      'unicorn/prefer-uint': 'warn',
      'unicorn/prefer-top-level-await': 'warn',
      'unicorn/prefer-includes-over-repeated-comparisons': 'warn',
      'unicorn/prefer-dom-node-text-content': 'warn',
      'unicorn/prefer-await': 'warn',
      'unicorn/prefer-add-event-listener': 'warn',
      'unicorn/no-unreadable-for-of-expression': 'warn',
      'unicorn/no-optional-chaining-on-undeclared-variable': 'warn',
      'unicorn/no-computed-property-existence-check': 'warn',
      'unicorn/no-array-reverse': 'warn',
      'unicorn/no-array-callback-reference': 'warn',
      eqeqeq: ['error', 'smart'],
      // Surfaces the 200-line guideline (CODE_GUIDELINES.md) as a warning so oversized files are
      // visible without blocking; known offenders (controller.ts, types.ts) await decomposition.
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      'no-restricted-globals': [
        'error',
        { name: 'name', message: 'Use a local variable; the global `name` resolves to window.name.' },
        { name: 'event', message: 'Pass the event as a parameter; the global `event` is deprecated.' },
        { name: 'length', message: 'Use a local variable; `length` resolves to an unexpected global.' },
      ],
    },
  },
  // Type-aware rules: scoped to non-test source (tsconfig excludes test files), so the
  // TypeScript project service can supply type information.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'web/src/**/*.ts', 'web/src/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Intentional `||` string fallbacks (e.g. `process.env.SHELL || 'bash'`, where an empty
      // string must also fall through) are allowed; non-string `||` defaults are flagged.
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
    },
  },
  // Import extension discipline. `src/` is NodeNext: relative imports must carry `.js` (and
  // `.json`), never `.ts`/`.tsx`. `web/` uses bundler resolution: relative TS imports are
  // extensionless, while stylesheet imports keep their extension.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: { 'import-x': importX },
    // TypeScript-aware resolver so import rules can follow NodeNext `./foo.js` imports to `foo.ts`.
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: 'tsconfig.json' })],
    },
    rules: {
      'import-x/extensions': ['error', 'ignorePackages', { ts: 'never', tsx: 'never', js: 'always', json: 'always' }],
      // NOTE: import-x@4's graph traversal did not fire in this eslint@10 setup (verified against a
      // deliberate cycle), so this currently provides little live enforcement. Until that is sorted,
      // verify out-of-band with `npx madge --circular --extensions ts,tsx src` (which does work).
      'import-x/no-cycle': 'error',
    },
  },
  {
    files: ['web/src/**/*.ts', 'web/src/**/*.tsx'],
    plugins: { 'import-x': importX },
    rules: {
      'import-x/extensions': ['error', 'never', { css: 'always' }],
    },
  },
  // React hooks correctness (web client only).
  {
    files: ['web/src/**/*.ts', 'web/src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: ['dist/', 'web/dist/', 'node_modules/', '.janissary/'],
  },
);
