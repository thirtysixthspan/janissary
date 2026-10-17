# Startup state after managed system-shell preparation

**Complexity: 2/10** — CI confirms startup behavior is correct; the repair is limited to replacing an invalid array-position assumption in one WebSocket test with the actual focus and visibility contract.

## Goal

Resolve the recurring CI timeout in `src/index.test.ts` where `startServer (WS + RPC + security) > accepts a token-gated client and streams transcript state` waits for a state event whose first tab is `janus`. Preserve the product startup contract: `janus` remains visible and focused, and the managed `system` shell remains present but hidden and never takes focus.

## Evidence and diagnosis boundary

The failure reproduces in GitHub CI runs 39007389829 and 39036689506. Diagnostic run 39037396033 captured the state sequence: after PTY exits and a system-shell recovery failure, state included `notifications`, `janus`, and hidden managed `system`, with `activeTab` selecting `janus`. The notification tab is inserted at the beginning of its group, so the old test's `tabs[0] === 'janus'` assumption timed out even though the startup contract held. The focused test and diff-scoped checks run locally in this workspace; no production failure has been observed.

`src/index.ts:61–74` (`startServer`) opens and validates `janus`, awaits managed system-shell preparation, then listens. `src/message/handler.ts:24` (`case 'init'`) sends the complete state directly to the requesting socket, and `src/state/event.ts:10–25` (`buildStateEvent`) obtains all tabs from `controller.view()`. CI showed that the shell failure notification creates a `notifications` tab; `src/tab/creators.ts:65–81` (`addNotificationsTab`) inserts it at the start of its group. The `janus` tab remained visible and active at index 1, and `system` remained hidden and managed. Existing lifecycle coverage in `src/tab/hidden-lifecycle.integration.test.ts:66–93` pins `janus` focus and hidden system state without making tab index zero a product invariant.

## Decisions

- Keep non-secret, CI-safe failure context in the existing `src/index.test.ts` case. It records observed event types, RPC reply status, and state tab summaries (`label`, `hidden`, `systemShell`, `activeTab`) only when the predicate times out. It does not log the token, URL, transcript, cwd, or shell output.
- Keep the test's real WebSocket and its token gate. Do not skip, retry-filter, lengthen the timeout as a remedy, or replace its assertion with a weaker check.
- Assert the full startup contract in the existing case: the state includes visible `janus`, `activeTab` selects `janus`, and a `system` tab is marked hidden and managed. Find `janus` by label for both its startup state and follow-up `help` transcript assertion because startup notifications may insert their tab before it.
- Make no production change: CI evidence shows startup and notification focus behavior are correct. Correct only the stale test assumption about array position while retaining the meaningful visibility, focus, hidden-system, and transcript assertions.
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

1. Use CI-safe failure context in the existing failing test to report event type and RPC reply status plus each received state's tab labels, `hidden`/`systemShell` flags, and `activeTab`.
2. Replace both array-index predicates with label-based checks: find a visible `janus` and confirm that its index is active while managed `system` is hidden, then verify Markdown output in `janus` after `help`. Preserve the real token-gated WebSocket flow and original timeouts.
3. Run the focused test and diff-scoped checks. Review the diagnostic fields to ensure they contain no secret, path, or transcript data.

## Verification

Run `./scripts/run.mjs check-diff` after each change and run `src/index.test.ts` explicitly if diff selection omits it. Publish the repair as a separate commit on the existing feature branch and rerun the full GitHub CI workflow. A repair is complete only when CI passes the startup-state and transcript-streaming assertions, lint and typecheck pass, and the PR remains open.

## Out of scope

Do not edit the canonical system-schedules source plan or plan 16, weaken or skip the startup-state assertion, change system-shell focus/visibility behavior, add retries, alter CI configuration, merge or close PR #1729, or create another PR.
