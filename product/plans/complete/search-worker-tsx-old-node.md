# Load the search matching worker's TypeScript on Node versions where tsx skips worker threads

**Complexity: 2/10** — a one-function change to how `src/plugins/search/matching-worker.ts` loads tsx into the source-mode matching worker, plus one real-worker regression test. No protocol, client, or UI change.

## Bug

Named at invocation: `search foo` shows `Cannot find module '<checkout>/src/error-text.js' imported from <checkout>/src/plugins/search/matcher-worker-entry.ts`.

## Root cause

When Janissary runs from a source checkout, the matching worker loads `matcher-worker-entry.ts` and needs tsx to map its NodeNext `.js` imports onto the `.ts` files beside them. `defaultWorker` arranges that by passing `--import <resolved tsx>` in the worker's `execArgv`. That points at tsx's `loader.mjs`, which only registers its hooks in a worker thread on Node versions where `isInternalThread` exists: 22.22.3+, 24.11.1+, 25.1+ and 26+. On an earlier Node that still supports `module.register` (for example 24.10.0), the loader registers on the main thread only, so in the worker it does nothing.

The worker still starts, because these Node versions strip TypeScript types natively. But native stripping does not rewrite `./x.js` to `./x.ts`, so the entry's first relative import, `../../error-text.js`, fails with `ERR_MODULE_NOT_FOUND`. Since #1755 that reason reaches the search tab, which is the error the user reported. On Node 24.11.1 and later the same code works, which is why it passed on the machines where #1752 and #1755 were verified.

## Correct behavior

The search spec says matching runs off the server's main thread and a search lists its matches, including when Janissary runs from a source checkout. `search foo` lists matching rows from a source checkout on every Node version Janissary runs on, not just versions where tsx's `--import` entry happens to register in workers.

## Reproduction

1. With `temp/node24.10/.../bin/node` (Node 24.10.0, downloaded into `./temp/`), `node node_modules/tsx/dist/cli.mjs temp/repro/worker.ts` creates a real matcher with `createMatcherWorker('foo', …)` and calls `detect`. Observed: `Cannot find module '<checkout>/src/error-text.js' imported from <checkout>/src/plugins/search/matcher-worker-entry.ts`. The same script on Node 24.19.0 prints `detect true`.
2. The tsx gate is in `node_modules/tsx/dist/esm/index.mjs`: it registers when `isFeatureSupported([[22,22,3],[24,11,1],[25,1,0],[26,0,0]]) && !isInternalThread`, or otherwise only when `isMainThread`.
3. A worker started with `--import` of a `data:` module that calls `register()` from `tsx/esm/api` answers `detect` with `true` on Node 24.10.0, 24.19.0 and 26.6.0, both under tsx and plain node.

## Approach

Register tsx in the worker through its programmatic API instead of its `--import` entry. `tsx/esm/api`'s `register()` does not check which thread it runs on. `workerExecArgv` builds a small `data:` module that imports `register` from the resolved `tsx/esm/api` URL and calls it, and passes it to the worker with `--import`. The resolution still goes through `import.meta.resolve`, so tsx is still found in Janissary's own `node_modules`, as #1752 requires. Compiled mode keeps an empty `execArgv`.

## Implementation steps

1. `src/plugins/search/matching-worker.ts`: extract the worker's `execArgv` into an exported `workerExecArgv(moduleUrl)` (done test-first with the current behavior), then change its source-mode result to `--import data:text/javascript,<encoded "import { register } from '<tsx/esm/api URL>'; register();">`.
2. `src/plugins/search/matching-worker.test.ts`: add the regression test below.
3. `product/specs/search-tab.md`: state that a source-checkout search works whatever Node version Janissary runs on.

## Regression test

`src/plugins/search/matching-worker.test.ts` — "loads its TypeScript entry on a Node version where tsx registers only on the main thread": starts a real worker on the real entry with an extra `--import` that sets `process.versions.node` to `24.10.0` before tsx loads, followed by `workerExecArgv`. `detect(['todo'])` must resolve `true`. With the old `--import tsx` it rejects with the reported `Cannot find module …/src/error-text.js` error.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes, including the new test.
- Re-run `temp/repro/worker.ts` under Node 24.10.0 and confirm it prints `detect true`.
- Live end-to-end: build the web UI only (`npm run build:web`, no `dist/main.js`, so the server runs from source), start a scratch instance with Node 24.10.0's binary running `bin/janus.mjs`, and drive it with an `e2e-driver` batch that runs `search foo` and records the visible search tab body. Before the fix it shows `Cannot find module …/src/error-text.js …`. After it, it shows matching rows and no error.

## Out of scope

- Raising a minimum Node version or adding an `engines` field.
- The compiled build, which runs `matcher-worker-entry.js` without tsx and is unaffected.
- Other places that start TypeScript children from source (`src/browser/e2e-child-command.ts` reuses the parent's `execArgv` for a child process, not a worker thread).
