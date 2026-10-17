# Startup state after managed system-shell preparation

**Complexity: 4/10** — the repair is confined to the startup integration boundary and its existing WebSocket test, but diagnosis must distinguish a missing RPC reply, a malformed state snapshot, and incorrect tab visibility/order.

## Goal

Resolve the recurring CI timeout in `src/index.test.ts` where `startServer (WS + RPC + security) > accepts a token-gated client and streams transcript state` waits for a state event whose first tab is `janus`. Preserve the product startup contract: `janus` is the first visible, focused tab, and the managed `system` shell remains present but hidden and never takes focus.

## Evidence and diagnosis boundary

The failure reproduces in two GitHub CI runs on the feature branch: run 39007389829 (13,393 passed, one failed) and run 39036689506 (13,442 passed, one failed). In the latest run, the WebSocket opened and the test timed out at the state-event predicate; lint and TypeScript passed. The available CI excerpt contains no server exception or state payload, so it does not yet distinguish an absent state event from a state snapshot with the wrong tabs or order. The workspace cannot run direct loopback tests because the nested sandbox denies `connect` with `EPERM`.

The current startup sequence in `src/index.ts:61–74` (`bootCutoff`, `openLaunchShell`, `systemShell.ensure`, `systemSchedule.load`, `schedule.start`, `reattachSessions`) opens and validates `janus`, awaits `SystemShellManager.ensure()`, loads project schedules, starts the scheduler, and then listens. `src/message/handler.ts:24` (`case 'init'`) sends `controller.stateEvent()` directly to its requesting socket; `src/state/event.ts:10–25` (`buildStateEvent`) builds the snapshot from `controller.view()`. Existing coverage in `src/tab/hidden-lifecycle.integration.test.ts:66–93` expects a state containing visible `janus` followed by hidden `system`, and `src/tab/manager.ts:254–255` maps the manager's complete tab list into the view. These facts establish the intended contract and likely boundary, but do not establish the failure's root cause.

## Decisions

- Diagnose before changing behavior. Extend only the existing failing `src/index.test.ts` case with non-secret, CI-safe failure context that records observed event types, RPC replies, and state tab summaries (`label`, `hidden`, `systemShell`, `activeTab`) if the predicate times out. Do not log the token, URL, transcript, cwd, or shell output.
- Keep the test's real WebSocket and its token gate. Do not skip, retry-filter, lengthen the timeout as a remedy, or replace its assertion with a weaker check.
- Assert the full startup contract in the existing case: the state has `janus` first, visible and active; it also includes `system` marked hidden and managed; the hidden system tab does not become active. Preserve the follow-up `help` transcript assertion.
- Use diagnostic evidence to select the smallest fix at the existing startup/state owner. If the cause is the system-shell preparation sequence, adjust only the ordering or awaited work shown by that evidence. If the snapshot is correct and the failure is in test event observation, correct event collection without weakening the behavioral assertions.
- Do not change the product startup contract, system-shell visibility/focus behavior, unrelated schedules behavior, or CI workflow policy.

## Existing code to reuse

| Concern | Existing owner |
| --- | --- |
| Startup sequencing | `src/index.ts:61–74`, `startServer` |
| Required launch shell validation | `src/launch-shell.ts:14–32`, `openLaunchShell` |
| Managed hidden shell creation and failure isolation | `src/system-shell.ts:33–39` and `77–117`, `SystemShellManager.ensure` / `ensureShell` |
| Initial RPC state response | `src/message/handler.ts:22–25`, `init`; `src/state/event.ts:10–25`, `buildStateEvent` |
| Hidden-tab snapshot contract | `src/tab/hidden-lifecycle.integration.test.ts:66–93` |
| Failing real WebSocket test | `src/index.test.ts:339–353` |

## Implementation steps

1. Add sanitized diagnostic context to the existing failing test so the next CI run reports event type and RPC result/error, plus each received state's tab labels and `hidden`/`systemShell` flags and `activeTab`. This distinguishes no init response, an RPC error, a state without `janus`, and an incorrectly ordered/visible state. Keep the existing timeout and its behavioral predicate.
2. Run the focused test through the repository's diff-scoped workflow. Treat the local `EPERM` loopback restriction as an environment limitation, not evidence of a pass; use the published CI run's diagnostics for the failing path.
3. Based on the captured CI evidence, implement the smallest correction in the owning test or startup/state source. Update the focused assertion to prove the complete visible/focused `janus` and hidden/non-focused `system` contract.
4. Recheck the diagnostic output contains no secret or transcript data and remove any temporary diagnostic machinery that is no longer needed while retaining useful failure context.

## Verification

Run `./scripts/run.mjs check-diff` after each change. Run `src/index.test.ts` and `src/tab/hidden-lifecycle.integration.test.ts` explicitly when diff selection omits either. Because local loopback is blocked by nested sandbox `EPERM`, report that targeted WebSocket execution is unavailable locally; publish the implementation as a separate commit on the existing feature branch and rerun the full GitHub CI workflow. A repair is complete only when CI passes the initial-state and transcript-streaming assertions, lint and typecheck pass, and the PR remains open.

## Out of scope

Do not edit the canonical system-schedules source plan or plan 16, weaken or skip the startup-state assertion, change system-shell focus/visibility behavior, add retries, alter CI configuration, merge or close PR #1729, or create another PR.
