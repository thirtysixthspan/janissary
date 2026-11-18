# Cover executor rejection with the real subagent driver

**Complexity: 1/10** — test-only change against already-implemented behavior; no production lines, files, requirements, scenarios or new units (p=1.578).

## Goal

Add the two focused executor-rejection cases named in the `subagent-19` subplan Tests section (the "Independent run and cleanup" and "Fresh clone and remote lifecycle" seams). They must exercise the real `executeSubagentRun` and its real `runSubagentEntry` attempt driver, admit the plan-18 replacement driver, and throw an exact multiline error from a fallback activity subscriber while that replacement attempt is still active and its disposal is deferred. This closes the coverage gap where every executor-rejection test used a plain rejected-promise stub — including the one whose allocation had already ended — so a regression that reintroduces the settlement hang would no longer pass the suite.

Source: `product/plans/ready/subagent-23-end-to-end-verification.md`, whose canonical Tests rows live at `product/plans/complete/subagent-19-background-launch-lifecycle.md:76`.

## Approach

No production change. The owned-run abort on unexpected executor rejection (`src/subagent/settle.ts`), the real allocation/abort/finally lifecycle (`src/subagent/attempt.ts`, `src/subagent/attempt-session.ts`, `src/subagent/execute-session.ts`) and the remote clone-retention/lease-last barrier (`src/subagent/remote-workspace.ts`) are already implemented and already documented in `product/specs/subagent.md`. The fix is two integration-style tests that pin the abort-before-settlement ordering and the no-hang behavior against the real driver lifecycle:

- A local case in `src/subagent/settle.test.ts` that drives real `executeSubagentRun` through a controlled `connectAcp`/`runToolLoop` pair, fails the first entry, admits a replacement whose session shutdown is deferred, and throws the multiline error from a `run.subscribe` fallback-notice subscriber.
- A selected-remote case in `src/subagent/launch.test.ts` that goes through real `launchSubagent` with a real `RemoteChannel` fixture and a controlled `createRemoteAcpSession`/`runToolLoop` pair, asserting the ready clone is retained and the channel lease is the last thing dropped.

The tests use event traces and deferred gates rather than sleeps, keep real allocation/disposal semantics, and do not use a stub whose allocation already ended as the sole proof.

## Implementation steps

1. In `src/subagent/settle.test.ts`, add hoisted `connectAcp` and `runToolLoop` mocks that preserve the real modules, import the real `executeSubagentRun`, and build a two-entry real-execution options object on the existing controller run. Drive the first entry to a handshake then a failure, wait for the replacement attempt to be admitted with its session shutdown deferred, and throw the exact multiline error from a subscriber that matches only the fallback notice text.

2. Assert the full local contract: the owned signal aborts before failed settlement; the deferred disposal runs exactly once; completion stays pending until disposal and allocation release; settlement then completes without a hang with one failed completion carrying the original multiline error and the first observed provider id; late terminal callbacks cannot replace the failure or send another reply. Also assert a normal returned failed result from the real driver introduces no abort.

3. In `src/subagent/launch.test.ts`, let the existing `./execute.js` mock delegate to the real `executeSubagentRun` for this one case, add controlled `createRemoteAcpSession` and `runToolLoop` mocks, and build a real `RemoteChannel` fixture whose transport answers `run-clone` create/release frames. Drive the same fallback-admission-then-throw sequence through `launchSubagent` with a fallback-notice subscriber installed before the continuation runs.

4. Assert the remote contract: owned abort before failed settlement, one deferred remote session release, completion pending until disposal and allocation release, one failed completion with the original error and first provider id, late callbacks ineffective, the ready clone retained (create sent, no clone-release frame), and the channel lease dropped last.

## Tests

- `src/subagent/settle.test.ts`: one focused local case — real driver fallback admission, deferred disposal, owned abort ordering, no-hang settlement, single latched failed completion with original error and first provider id, late callback rejection, plus a normal-returned-failed-result no-abort assertion.
- `src/subagent/launch.test.ts`: one focused selected-remote case — real channel and real driver fallback admission, deferred disposal, owned abort ordering, no-hang settlement, single failed completion, late callback rejection, clone retention and lease-last release.

Both cases record event order with deferred gates instead of sleeps and await every deferred allocation/disposal before teardown.

## Spec

No spec change needed. `product/specs/subagent.md:89` already states that an unexpected executor rejection aborts the run's own controller before failed settlement and that completion is latched once after cleanup; `product/specs/subagent.md:97` already states that an unexpected executor rejection retains the ready clone and drops the channel lease last. This plan adds only tests for that documented behavior.

## Out of scope

No production source, API, type or protocol changes. No new ACP tool/fallback/permission matrices, no repeated harness variants, no public command fixture, no manual end-to-end run, no help/user-documentation changes, no PR description change, no merge.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each change. Do not run `npm run check`. The environment's `src/index.test.ts` EPERM WS/RPC failures are unrelated and environmental.
