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
          exclude: [...configDefaults.exclude, '**/.janissary/**'],
        },
      },

      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['web/src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, '**/.janissary/**'],
          setupFiles: ['web/src/test/setup.ts'],
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
