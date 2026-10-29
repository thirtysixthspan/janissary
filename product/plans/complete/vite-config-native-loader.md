# Make the web Vite config load under the native config loader

**Complexity: 1/10** — two one-line changes in `web/vite.config.ts`, a matching compiler flag, and a regression test. The build output does not change.

Every `vite build` and `vite` dev run printed a warning that `web/vite.config.ts` uses features `configLoader: 'native'` does not support. Vite plans to make the native loader the default in a future major version. The two features are the CommonJS `__dirname` global (line 47) and the extensionless relative import `./pdfjs-assets` (line 7). Node's native ESM loader provides neither.

## Goal

The web Vite config loads under the native config loader with no unsupported-feature warnings, so builds stop printing the warning and the next Vite major doesn't break them.

## Approach

- Replace `root: __dirname` with `root: import.meta.dirname`, the ESM equivalent the warning recommends.
- Import `./pdfjs-assets.ts` with its real extension. The native loader resolves files exactly as Node does, and Node's type stripping needs the `.ts` file name. The documentation site's VitePress config already imports its helpers this way.
- Enable `allowImportingTsExtensions` in `web/tsconfig.json`, which typechecks `vite.config.ts`. TypeScript rejects a `.ts` import specifier without it. The project already sets `noEmit`, which this flag requires.

## Implementation steps

1. Edit the two lines in `web/vite.config.ts`.
2. Add `allowImportingTsExtensions: true` to `web/tsconfig.json`.
3. Add `scripts/vite-config.test.mjs`, next to the existing `scripts/pdfjs-assets.test.mjs` that tests the config's helper module.

## Tests

- Loading `web/vite.config.ts` with Vite's `loadConfigFromFile` and the `native` loader logs no warnings.
- The natively loaded config's `root` is the `web` directory.

Both tests fail against the old config.

## Spec and docs

No behavior changes. No spec, help page, or user documentation describes the Vite config.

## Out of scope

- Switching the project's build scripts to `configLoader: 'native'` now. The goal is only that the config is ready for it.
- The other Vite warning, about chunks over 500 kB.
