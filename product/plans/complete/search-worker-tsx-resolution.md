# Load the search matching worker's TypeScript loader from Janissary, not the working directory

**Complexity: 2/10** — a one-line change to the worker's `execArgv` in `src/plugins/search/matching-worker.ts`, plus one real-worker regression test. No contract, protocol, or UI change.

## Bug

From `product/backlog/bugs.md`: the search tab throws `Cannot find module '…/src/plugins/search/compile-matcher.js' imported from …/src/plugins/search/matcher-worker-entry.ts`, or `Search matching cancelled`.

## Root cause

When Janissary runs from a source checkout, `defaultWorker` in `src/plugins/search/matching-worker.ts` starts the matching worker on `matcher-worker-entry.ts` with `execArgv: ['--import', 'tsx']`. Node resolves a bare `--import` specifier against the process's current working directory, and `bin/janus.mjs` spawns the server in whatever directory the user ran `janus` from — the user's project, not the Janissary checkout. So the worker loads whatever `tsx` that project resolves, or none at all:

- A project that resolves a `tsx` which does not register hooks for `--import` (an older or different install) leaves the worker on Node's built-in type stripping, which runs the `.ts` entry but cannot map its `.js` relative imports to `.ts` files. The first relative import fails: `compile-matcher.js` in the reporter's version of the entry, `error-text.js` in the current one.
- A project that resolves no `tsx` at all fails the worker with `Cannot find package 'tsx'`.

Either way the worker's `error` event terminates it and rejects the pending job with that error; every later job for the same search is rejected with `Search matching cancelled` because the worker is already closed. The compiled build (`dist/`) is unaffected — its entry is `.js` and needs no loader.

## Correct behavior

A search from a source checkout matches files no matter which directory `janus` was started in. The search spec already describes searches that succeed; nothing in it ties matching to the working directory.

## Reproduction

1. A throwaway script under `./temp/repro/` that calls `createMatcherWorker('todo', …)` and runs `detect(['todo'])` twice, run through the repository's `tsx` CLI from a directory `temp/repro/proj` whose `node_modules/tsx` is a stub package that registers nothing (standing in for a project with its own, different `tsx`). Observed:
   - `a.ts error: Cannot find module '…/src/error-text.js' imported from …/src/plugins/search/matcher-worker-entry.ts`
   - `b.ts error: Search matching cancelled`
2. The same script run from the repository root prints `detect: true` — the failure depends only on the working directory.
3. The regression test below, run against the unfixed code, fails with the same `ERR_MODULE_NOT_FOUND` error.

## Approach

Resolve the loader against the Janissary module rather than the working directory: pass `import.meta.resolve('tsx')` — an absolute `file:` URL to the `tsx` installed alongside this checkout — as the worker's `--import` value. `tsx` is already a dependency of every source run (`bin/janus.mjs` launches source through the checkout's own `node_modules/tsx`), so it is always resolvable from the module.

## Implementation steps

1. `src/plugins/search/matching-worker.ts`: in `defaultWorker`, replace `['--import', 'tsx']` with `['--import', import.meta.resolve('tsx')]`.
2. `product/specs/search-tab.md`: state under "How a search is run" that searching works the same whichever directory the application was started from.

## Regression test

`src/plugins/search/matching-worker.test.ts` — "loads its TypeScript entry when the working directory resolves a different tsx": creates a temporary project directory whose `node_modules/tsx` is a no-op stub, changes the working directory into it, starts a real matcher worker for `todo`, and asserts `detect(['todo'])` resolves `true`. Without the fix it rejects with `Cannot find module '…/src/error-text.js'`.

## Verification

- `./scripts/run.mjs check-diff` passes, including the new test.
- Re-run the Step 1 reproduction script from `temp/repro/proj` and confirm both calls print `detect: true`.
- Live end-to-end: build only the web bundle (`npm run build:web`) so that, with no `dist/`, `bin/janus.mjs` runs `src/main.ts` through the checkout's `tsx` — the source-only path this bug lives on. Create a scratch project under `./temp/fix-a-bug/work` (its own git repo, holding `notes.md` and `src/a.ts` that both contain `needle`, plus a no-op stub `node_modules/tsx`) and start `janus --no-open` from inside it with a scratch `HOME`. A driver runs `search needle` and reads the search tab's body. Expected before the fix: the body shows `Cannot find module '…/src/error-text.js' imported from …/matcher-worker-entry.ts`. Expected after: rows for `notes.md` and `src/a.ts`, no error.

## Out of scope

- The search tab's error surface and the "cancelled" follow-on message for later files once a worker fails.
- Any other use of `tsx` resolution outside the search matching worker (there is none today).
