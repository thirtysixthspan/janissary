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
            ...configDefaults.exclude,
            '**/*.browser.test.{ts,tsx}', '**/*.sandbox.test.{ts,tsx}', '**/*.unsandboxed.test.{ts,tsx}',
          ],
          hookTimeout: 30_000,
        },
      },

      // Tests that need real OS process semantics Seatbelt breaks for a sandboxed workspace:
      // ChildProcess#kill() (the `signal` operation has no `(allow ...)` rule, so it's denied by
      // default) or os.tmpdir() (sandbox.ts overrides TMPDIR to a path nested inside the parent
      // repo's own git tree). Not part of `npm test` or `npm run check` — run via
      // `npm run test:unsandboxed` on the host.
      {
        test: {
          name: 'unsandboxed',
          environment: 'node',
          include: ['src/**/*.unsandboxed.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude],
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
          exclude: [...configDefaults.exclude],
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
          exclude: [...configDefaults.exclude],
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
            ...configDefaults.exclude,
            '**/*.browser.test.{ts,tsx}', '**/*.sandbox.test.{ts,tsx}', '**/*.unsandboxed.test.{ts,tsx}',
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
        'web/src/main.tsx',
      ],
      // Baseline measured 2026-06-26: combined ~58% stmts, ~51% branches, ~59% funcs, ~63% lines.
      // web/src is all 0% (no tests yet). Per-glob thresholds set just below the src/ floor.
      thresholds: {
        autoUpdate: true,
        'src/**': {
          statements: 87.91,
          branches: 79.99,
          functions: 89.83,
          lines: 90.94,
        },
        'web/src/**': {
          statements: 73.91,
          branches: 66.77,
          functions: 72.63,
          lines: 79.08,
        },
      },
    },
  },
});
