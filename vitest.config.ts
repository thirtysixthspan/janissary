import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    // Skip the runtime state/workspace directory — it can contain ephemeral copies of the
    // source tree (and its tests) that should not be collected.
    exclude: [...configDefaults.exclude, '**/.janussary/**'],
  },
});
