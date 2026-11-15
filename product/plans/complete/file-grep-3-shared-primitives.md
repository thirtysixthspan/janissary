# Expose existing secret policy and matcher deadline identity
**Complexity: 4/10** — ~4 added production lines across 2 files, 8 requirements and 27 secret-policy/error-lifecycle scenarios (p=5.19707).

## Dependencies

Depends on: none (file glob has already landed). Source: `product/plans/complete/file-grep.md`, the unchanged canonical feature document archived by the decomposition.

## Goal and decisions

Expose the two existing mechanisms grep needs without changing search-tab or file-read behavior. The canonical feature's “Scan” section assigns the lexical secret predicate and typed matcher-deadline distinction to this plan. Plan 4 consumes the predicate; plan 5 consumes the error class. Neither consumer is wired here, and the parser and formatter plans are not prerequisites.

## What already exists (reuse, don't rebuild)

| Existing piece | Verified location | Reuse |
| --- | --- | --- |
| Lexical secret predicate | `src/file-read/policy.ts:23`, `isSecretPath` | Export the existing function in place, retaining its current body and module initialization. |
| Deny-table segment runs | `src/file-read/policy.ts:14`, `SECRET_SEGMENT_RUNS`; `src/sandbox/paths.ts:149`, `SECRET_DENY_PATHS` | Keep the existing lowercased, contiguous complete-segment matching. Do not copy the table. |
| Minimal typed error | `src/cli-args.ts:6`, `CliUsageError` | Follow its minimal `Error` subclass pattern with the inherited message constructor. |
| Deadline site and shared request path | `src/search/matching-worker.ts:85`, `request`; `src/search/matching-worker.ts:98`, deadline `terminate` call | Replace only the deadline reason's constructor. Both `detect` and `rows` already use this request path. |
| Worker closure lifecycle | `src/search/matching-worker.ts:53`, `rejectPending`; `src/search/matching-worker.ts:61`, `terminate`; `src/search/matching-worker.ts:88`, `closedBy` check | Keep rejection, timer cleanup, listener cleanup, stored reason and single termination together. |
| Worker test seam | `src/search/matching-worker.test.ts:12`, `FakeWorker`; `src/search/matching-worker.ts:24`, `MatcherWorkerOptions` | Reuse the injected worker and deadline override rather than adding production injection APIs. |

Existing predicate callers are `checkLexicalPath` at `src/file-read/policy.ts:60` and the closure in `createRealTargetCheck` at `src/file-read/policy.ts:78`; `checkRealTarget` delegates to the latter. They remain in place, preserving the readers, writer target checks and glob consumers of these policy functions.

Existing worker consumers are `searchText` at `src/file-navigator/search-text.ts:26` and `startScan` at `src/plugins/search/scan.ts:187`. The former propagates rejection and disposes in `finally`; the latter reports `Error.message` through `oneLine` at `src/plugins/search/scan.ts:216`. Neither needs an edit. Preserve the one-second failure behavior documented at `product/specs/search-tab.md:155`; this foundation adds no public command or wire contract.

## Proposed changes

1. Export `isSecretPath(relative)` unchanged from `src/file-read/policy.ts`. It accepts a relative path using native `path.sep`, lowercases it, checks the last segment for exactly `.env` or a `.env.` prefix, then checks contiguous segment runs from the existing deny table. Do not normalize Unicode, resolve paths, add separator conversion, or expand the basename rule to `.environment` or a `.env` directory's ordinary children. The predicate performs string checks only; containment, symlinks and home-secret anchors stay in the surrounding policy functions and later candidate-reader plan.
2. Add exported `MatcherDeadlineError` extending `Error` in `src/search/matching-worker.ts`, beside the deadline constant. Use the inherited message constructor, like `CliUsageError`; add no error codes, custom name, deadline fields or serialization. Later consumers import the constructor directly from this defining module and distinguish it with `instanceof`.
3. Instantiate the class at the request timer's existing deadline termination site only. Preserve the exact message `Search matching exceeded its <deadline> ms deadline`, with the effective numeric deadline substituted. The default remains `MATCHING_JOB_DEADLINE_MS` 1000 and `options.deadlineMs` still overrides it; the timer starts per request, covering both `detect` and `rows`, without any new overall-scan timeout.
4. Preserve shared closure behavior: the first terminal reason is stored in `closedBy`, all pending requests reject with that same reason, their timers are cleared, the abort listener is removed, and the underlying worker is terminated once. Later requests reject with the stored reason without posting work. Late replies, a later abort or exit, and repeated disposal cannot replace a deadline reason or terminate twice. Do not move cleanup or wrap errors at callers.
5. Preserve every non-deadline failure path. A worker `error` retains the original `Error` object, an unsolicited exit retains `Search matching worker exited with code <code>`, a worker response with `error` still rejects only that job with an ordinary `Error`, and signal cancellation/disposal retain `Search matching cancelled`. These paths must not be relabeled as `MatcherDeadlineError`; worker response failures must not close an otherwise usable worker.

## Tests

Extend the existing colocated Vitest tests. No source caller migration is needed.

- In `src/file-read/policy.test.ts`, retain all existing policy assertions and add a direct import of `isSecretPath` with table cases for ordinary and empty paths; mixed-case `.env`; nested `.env.local`; a nested multi-segment deny entry; a similar but incomplete deny run; `.environment`; and an ordinary child of a `.env` directory. Build multi-segment fixtures with native path joining. These eight cases pin the exported lexical contract without modifying it or duplicating home-anchor tests.
- In `src/search/matching-worker.test.ts:49`, extend the existing two-pending-job deadline case with the exact custom-deadline message, `Error` and `MatcherDeadlineError` identity, identical reasons for pending `detect`/`rows`, and the same stored rejection for a later request with no new post. Retain the late-reply and repeated-disposal assertions; also deliver abort/exit after closure and assert no second termination or changed reason. Use the existing worker seam with controlled Vitest timers, attach rejection observers before advancing time, and restore timers after the case.
- Add a separate default-deadline boundary case: a pending request is unsettled immediately before 1000 ms, then rejects with the new class and exact 1000 ms message when that timer fires. No production timeout changes or wall-clock sleeps are needed.
- Extend the existing cancellation case and add independent disposal-before-deadline coverage, asserting ordinary cancellation errors. Extend the existing worker-failure-before-first-job case to preserve object identity. Add worker-error-during-pending-work, unsolicited worker-exit, and worker-response-error cases. Extend `FakeWorker` with an exit emitter in the test only; assert ordinary errors and existing exit text. After a response error, a second successful request proves the adapter remains open.
- Retain the real-worker responsiveness/recovery test at `src/search/matching-worker.test.ts:93` and its source-loader tests. Strengthen its deadline assertion to the new class while retaining the fresh worker's successful query. Run `src/file-navigator/search-text.test.ts` and `src/plugins/search/scan.test.ts` as consumer regressions; their production behavior and existing assertions stay unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. During implementation, confirm the policy, worker and two consumer suites above actually run; when related-test selection omits one, run that named suite through `npm run test:server -- <test-path>` without rerunning the whole suite.

For a manual module-level smoke check, call the exported predicate on a safe relative path and a nested `.env.local` fixture and observe false/true. Use the injected nonreplying worker with a short deadline to confirm a pending request yields the new class with the unchanged message, then a later request yields the same reason. In the existing search tab, search a small known text fixture and confirm the same result row; the real-worker test remains the deterministic evidence for responsiveness and later-query recovery. Full `file grep` execution becomes available in plan 12.

## Out of scope

No scan or candidate reader, command registration, caller rewrites, worker protocol changes, deadline-duration changes, message-text matching, policy normalization or secret-policy changes. Public grep help/spec integration remains with the later behavior-exposing plans and plan 17.

## Implementation constraints

Use direct `.js` imports in `src` and no re-export barrel. `policy.ts` and `matching-worker.ts` currently have 102 and 124 raw lines respectively, already upper bounds on their lint-counted sizes, so the export and small error class fit below the 200-line limit without extraction. Preserve type-aware and security lint rules from `eslint.config.mjs`; tests are exempt from `max-lines`. No `npm run check`; use the diff-scoped development gate.
