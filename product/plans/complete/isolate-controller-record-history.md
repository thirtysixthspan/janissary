# Isolate controller tests from durable record history

**Complexity: 4/10.** The repair spans existing controller fixtures and their async cleanup, with two storage-isolation strategies and regression coverage. The backlog rates the existing issue's severity 7/10. The explicit invocation permits the selected work regardless of its complexity rating.

## Goal

Resolve PR #1916's recorded item: Remove the test-isolation debt introduced by eager record recovery in shared controller construction. Unrelated controller tests must not recover or prune the checkout's durable ACP history.

## Verified approach

`createManagers` constructs `AcpSessionRecords` synchronously, and its constructor scans, recovers open records, and prunes expired records. `AcpRecordStore` defaults to `process.cwd()` when no project directory is supplied. The ten suites named by the proposal contain unscoped constructions. The durable-record factory tests already pass isolated projects and await shutdown.

Use a shared test-only scratch-project factory for tests independent of checkout paths. Track every controller and await shutdown before deleting its project, including when an assertion fails. Keep the checkout-based `src/controller.test.ts` directory semantics intact with a file-local mock of only `AcpRecordStore`; do not mock the record manager or filesystem globally. Production recovery remains synchronous and unchanged. Keep the durable factory tests and recorder model/store/manager suites on real storage.

## Scope and implementation steps

1. Add `src/controller/test-project.ts` with explicit create/dispose lifecycle and scratch roots under the checkout's ignored `temp/` directory. Migrate unscoped fixtures in `src/managers.test.ts`, `src/controller/create-managers.test.ts` (only unrelated wiring fixtures), `src/agent/manager.test.ts`, `src/controller/workspace-notice.test.ts`, `src/controller/create-adapters.test.ts`, `src/controller/shell.unsandboxed.test.ts`, `src/plugins/agent-monitor/activate.test.ts`, and `src/tab/hidden-lifecycle.integration.test.ts`. Pass the already-existing scratch workspace to the constructor in `src/commands/agent.test.ts`. Add awaited after-test disposal and cleanup where absent, retaining assertions about synchronous teardown.
2. Add a narrow file-local record-store mock and awaited after-test shutdown in `src/controller.test.ts`. Preserve default-root, README completion, and checkout-relative path assertions. Add `src/acp-records/history-test-fixture.ts` to seed valid open core/agent and expired closed sentinel files without depending on a mocked store. Add regression cases in `src/controller/test-project.test.ts` and `src/controller.test.ts` that simulate a checkout via a scoped `process.cwd` spy, construct/shut down the actual shared fixtures, and compare every sentinel file byte-for-byte. Also verify scratch disposal waits for async shutdown before removing storage. Restore spies and remove scratch data even on failure.
3. Update `product/specs/testing.md` with the durable-history isolation contract. No user-facing behavior changes, so help and public user documentation need no edits. Record verification results here, promote this plan to complete, and remove only the resolved entry from `product/backlog/pull-request.md`, retaining the exact comment-and-heading skeleton.

Run `$janissary/scripts/run.mjs check-diff` after each implementation step and after final spec/backlog changes. Any scope expansion requires editing this plan first. No new code comments are planned.

Verification found that the separately invoked unsandboxed controller tests still dispatch `shell true`, although captured execution is now the `!` command. Neither test reaches its prompt/connection assertion target. Update those two calls to `!true` in the already-scoped `src/controller/shell.unsandboxed.test.ts` so the required verification exercises the real shell and scratch-project display. No production routing change is needed.

## Tests

- Shared-fixture regression: seed valid open core, open agent, and expired closed records in a simulated checkout. Repeated scratch-controller construction and awaited disposal must leave all sentinel bytes unchanged and expose no checkout record rows.
- Checkout-dependent fixture regression: construct the existing `makeController` under the simulated checkout, verify default root is preserved, await shutdown, and require identical sentinel bytes.
- Lifecycle regression: gate asynchronous controller disposal and assert its scratch project still exists until shutdown settles, then is removed.
- Run all affected server tests through the diff-scoped checker. Explicitly run the recorder model/store/manager tests alongside the real-store factory tests to verify crash recovery, shutdown persistence, and expiry remain covered without a mock.
- Separately invoke `npm run test:unsandboxed -- src/controller/shell.unsandboxed.test.ts` when the environment supports process teardown; report any environment limitation as an outstanding verification blocker.

## Out of scope

Production record recovery, retention, controller APIs, storage layout, dependencies, live feeds, plugin/UI behavior, other backlog entries, PR title/body changes, merges, and history rewriting.

## Verification results

- Dependency preparation: audited this checkout's lockfile successfully, installed locked dependencies with lifecycle scripts disabled, and rebuilt esbuild, node-pty, and unrs-resolver. No dependency files changed.
- Scratch-project migrations and the checkout-dependent store mock are implemented. Three new tests cover sentinel preservation through both fixture strategies and awaited scratch cleanup. The sentinel seed is accepted by the real store and includes open core/agent records and an expired terminal record.
- Diff-scoped lint, incremental typechecks, and related server tests pass. Explicit execution of the new untracked test file passed both cases; Vitest's changed-file selection did not include it before staging.
- Recorder model/store/manager plus real-store controller factory tests: 89 passed across four files. Those suites retain real storage and the existing crash-recovery, shutdown-persistence, and expiry assertions.
- Separately invoked unsandboxed controller shell tests: two passed after correcting their stale captured-shell command syntax.
- Updated `product/specs/testing.md`. No help or public documentation changes are needed because application behavior is unchanged. The recorded entry requests no PR description correction.
