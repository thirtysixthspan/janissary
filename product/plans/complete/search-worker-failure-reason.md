# Report why the search matching worker failed instead of "Search matching cancelled"

**Complexity: 2/10** — a small change to how `createMatcherWorker` in `src/plugins/search/matching-worker.ts` remembers why it closed, plus one fake-worker regression test. No contract, protocol, or UI change.

## Bug

Named at invocation: `search foo` reports `Search matching cancelled` in the UI.

## Root cause

A search creates its matching worker before it lists the project, then posts its first job only after the file list arrives and the first batch has been read. If the worker fails in that window — it cannot load its entry, or it exits — its `error` or `exit` handler calls `terminate(reason)`. `terminate` rejects the jobs that are pending, but there are none yet, so `reason` is dropped; all it leaves behind is `closed = true`. The scan's first `detect` then hits the `closed` guard in `request`, which always rejects with the generic `Search matching cancelled`. That is the first and only error the scan sees, so it is what the tab shows.

The window is short in a small project, where the first job is already pending when the worker fails and the real reason reaches the tab. In a project large enough that listing it takes longer than the worker takes to fail, the reason is always lost. The user didn't cancel anything, so "cancelled" is also wrong on its face. The scan treats a search the user did cancel as silent, and that path is unaffected.

## Correct behavior

The search spec says the body shows "the reason when a search fails". A search whose matching worker fails shows that worker's own failure reason, whether the worker failed before or after the first job was posted. "Search matching cancelled" is reserved for a matcher that was actually cancelled or disposed.

## Reproduction

1. A throwaway script under `./temp/repro/` ran `startScan` for `foo` with a `listFiles` that resolves after 500 ms and a matcher built by `createMatcherWorker` over a real `Worker` whose entry throws `worker failed to load`. Observed: `batch {"rows":[],"done":false,"error":"Search matching cancelled"}`.
2. Live: with the source-mode loader temporarily reverted to the bare `--import tsx` from before #1752 (a real worker load failure), no `dist/`, and a scratch clone of this repository (4,217 files) carrying a no-op stub `node_modules/tsx`, Janissary was started from inside that clone and an `e2e-driver` batch ran `search foo`. The search tab body showed only `Search matching cancelled`, with no rows and no mention of the `Cannot find module …` failure behind it.
3. The same live run on current `master`, in both the compiled build and source mode, listed 250 rows. The worker loads fine there, so the hidden reason only surfaces when the worker actually fails.

## Approach

Keep the reason the matcher closed for, not just the fact that it closed. Replace the `closed` boolean with the `Error` passed to `terminate`. A request made after the matcher closed rejects with that error. Cancelling and disposing still close it with `Search matching cancelled`, so they read the same as before.

## Implementation steps

1. `src/plugins/search/matching-worker.ts`: replace `let closed = false` with `let closedBy: Error | null = null`; `terminate` records its reason there; `request` rejects with `closedBy` when it is set, and with `Search matching cancelled` when only the signal is aborted; the `exit` handler checks `closedBy === null`.
2. `src/plugins/search/matching-worker.test.ts`: add the regression test below.
3. `product/specs/search-tab.md`: state that a search whose matching fails shows that failure's reason, even when the failure happens before any file has been matched, and that a search is never reported as cancelled unless it was replaced or closed.

## Regression test

`src/plugins/search/matching-worker.test.ts` — "reports a worker failure that happens before the first job": a fake worker emits `error` with `worker failed to load` before any job is posted; the next `detect` must reject with `worker failed to load`. Without the fix it rejects with `Search matching cancelled`.

## Verification

- `./scripts/run.mjs check-diff` passes, including the new test.
- Re-run `temp/repro/masked.ts` and confirm the batch error is `worker failed to load`.
- Live end-to-end: repeat reproduction step 2 against the fixed tree. The temporary loader revert is applied again for the run only, because it is the one real way to make the worker fail to load, and is restored right after. The driver runs `search foo` in the stub-`tsx` clone and reads the visible search tab body. Expected: the body shows the `Cannot find module …` reason, not `Search matching cancelled`.

## Out of scope

- Why a particular user's worker failed to load. On current `master` the source-mode loader is resolved from the checkout (#1752), and an instance started before that fix can still hit it.
- Showing the worker failure anywhere other than the search tab body.
- Starting the worker lazily or retrying it after a failure.
