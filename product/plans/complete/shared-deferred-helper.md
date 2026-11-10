# Replace the hand-rolled deferred-promise boilerplate with one shared `deferred()` helper

**Complexity: 4/10** — ~40 added lines, 7 production files, 4 requirements, 5 test scenarios (p=5.10); mechanical replacement with no behavior change.

Nine call sites across the server, remote, and editor code build a promise and capture its resolve and reject functions by hand, each in a different shape, and seven carry an `eslint-disable` for `unicorn/prefer-promise-with-resolvers` because the web project's ES2023 library lacks `Promise.withResolvers`.

## Goal

One `deferred<T>()` helper returning `{ promise, resolve, reject }`, importable by both the server and web projects, replaces every hand-rolled site. The suppressions at those sites are deleted. Each site keeps its own settlement rules.

## Approach

1. Add `src/deferred.ts` exporting a `Deferred<T>` type and `deferred<T>()`. It is the only place that builds the promise by hand and carries the single suppression. Web code reaches it as `@shared/deferred`, which resolves to `src/` in the web tsconfig, Vite config, and vitest config.
2. Replace the sites, preserving surrounding semantics:
   - `timeout` in `src/plugins/guard.ts` (reject only)
   - `stopped` in `awaitReady` in `src/agent/readiness.ts` (reject only)
   - `ready` in `src/remote/entry-factory.ts` (keeps `void ready.catch(() => {})`)
   - `readiness` and `pending` (release) in `src/remote/acp-session.ts` (keeps the `ready.catch` guard)
   - `open` in `src/remote/channel/pending-requests.ts`
   - `save` in `web/src/editor/save-coordinator.ts`
   - `cleanupPromise` and `beginAllocation` in `src/agent/run.ts`
3. Delete the `eslint-disable-next-line unicorn/prefer-promise-with-resolvers` lines at those sites.

## Tests

- `src/deferred.test.ts`: resolves with the value, rejects with the reason, the first settlement wins when settled twice (resolve then reject, reject then resolve), and the functions work when destructured.
- Existing tests that must keep passing: `src/plugins/guard.test.ts`, `src/agent/readiness.test.ts`, `src/remote/channel/pending-requests.test.ts`, `web/src/editor/save-coordinator.test.ts`, the agent run tests under `src/agent/`.

## Specs and docs

Pure refactor with no user-visible change: no spec or documentation update.

## Out of scope

Test-file fixtures that define their own `deferred` or use `Promise.withResolvers`, and non-deferred `new Promise` uses (timers, event waits).
