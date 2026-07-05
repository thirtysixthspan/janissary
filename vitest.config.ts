import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, configDefaults, coverageConfigDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,

    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [
            ...configDefaults.exclude, '**/.janissary/**',
            '**/*.browser.test.{ts,tsx}', '**/*.sandbox.test.{ts,tsx}',
          ],
          hookTimeout: 30_000,
        },
      },

      // Tests that spawn a real Seatbelt sandbox via sandbox-exec. Not part of `npm test` or
      // `npm run check` (see the project-scoped scripts in package.json): sandbox-exec cannot
      // nest inside an already-sandboxed workspace, so these can only run on the host, via
      // `npm run test:sandbox`.
      {
        test: {
          name: 'sandbox',
          environment: 'node',
          include: ['src/**/*.sandbox.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, '**/.janissary/**'],
          hookTimeout: 30_000,
        },
      },

      // Playwright-backed tests that launch a real chromium. Deliberately not part of `npm test`
      // or `npm run check` (see the project-scoped scripts in package.json): workspaces install
      // with --ignore-scripts and never download browsers, and the workspace sandbox denies
      // access to playwright's browser cache — so these can only run on the host, via
      // `npm run test:browser`.
      {
        test: {
          name: 'browser',
          environment: 'node',
          include: ['src/**/*.browser.test.{ts,tsx}', 'web/src/**/*.browser.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, '**/.janissary/**'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },

      {
        plugins: [react()],
        // Mirrors web/vite.config.ts's alias (used there for the production build): needed
        // because most `@shared/*` imports are type-only (erased at transpile time), but
        // src/search-matches.ts is imported for real, runtime functions.
        resolve: { alias: { '@shared': fileURLToPath(new URL('src', import.meta.url)) } },
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['web/src/**/*.test.{ts,tsx}'],
          exclude: [
            ...configDefaults.exclude, '**/.janissary/**',
            '**/*.browser.test.{ts,tsx}', '**/*.sandbox.test.{ts,tsx}',
          ],
          setupFiles: ['web/src/test/setup.ts'],
          // Vitest stubs all CSS imports to an empty string by default; `?raw` imports (the
          // syntax-theme stylesheets) need their actual text content, so opt them back in.
          css: { include: [/\.css\?raw$/] },
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}', 'web/src/**/*.{ts,tsx}'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/.janissary/**',
        'web/src/main.tsx',
      ],
      // Baseline measured 2026-06-26: combined ~58% stmts, ~51% branches, ~59% funcs, ~63% lines.
      // web/src is all 0% (no tests yet). Per-glob thresholds set just below the src/ floor.
      thresholds: {
        autoUpdate: true,
        'src/**': {
          statements: 71.45,
          branches: 63.52,
          functions: 72.92,
          lines: 76.99,
        },
        'web/src/**': {
          statements: 3.43,
          branches: 4.76,
          functions: 5.68,
          lines: 3.83,
        },
      },
    },
  },
});
