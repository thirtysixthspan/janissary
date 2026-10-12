# Track tabs created by agent commands

Complexity: 7/10

## Goal

Close tabs created by a granted agent command when that run cleans up, without closing tabs that the command merely focused or updated. Wait for asynchronous workspace and tab-resource releases before the run cleanup settles.

## Approach

Carry the trusted run id from `CommandInvocationContext` through command dispatch, open/edit command execution and `OpenContext`, then through plugin failure origins and host-owned deferred opens. Command dispatch compares tab identities before and after each granted command; plugin invocation does the same around plugin handlers. Track only labels observed as newly allocated for an active run, paired with a tab incarnation so a later tab reusing a label cannot be closed. Keep tab allocation and deduplication as the source of truth, so existing tabs never acquire another run's ownership.

Make per-tab close return an awaitable release completion while preserving immediate removal and state publication. Await all owned-tab closures as part of `AgentRun.cleanup()` alongside existing resource cleanup and workspace release, attempting every release if one fails.

## Implementation steps

1. Add run-owned tab registration to `AgentRun` and `AgentRunManager`, with late registration rejected and immediately cleaned up. Track a new tab only after allocation is confirmed.
2. Carry optional run identity through granted `open` and `edit` command paths, the opener context, plugin invocation origins, `openClaimedFiles` deferred work, and plugin launch/ready allocation paths. Preserve identity through nested invocation contexts.
3. Make tab close expose an awaitable resource-release completion, including workspace release, and await each owned-tab closure in run cleanup.
4. Add lifecycle and allocation tests covering completion, failure, termination, resource-release ordering, deduplicated/focused existing tabs, and deferred/plugin opens.
5. Update `product/specs/agent-command.md` with the observable ownership and cleanup behavior.

## Tests

- `src/agent/manager.test.ts`: newly created run-owned tabs close after completion, failure, and termination; cleanup waits for tab resource release; an existing tab remains open and usable; a late allocated tab is closed.
- `src/command/manager.test.ts`: command dispatch records only newly allocated tabs for an active invocation run.
- `src/open/file-manager.test.ts`: command run identity reaches editor and plugin opener paths; a deduplicated editor open does not register ownership.
- Relevant plugin/opening tests: run ownership survives deferred claimed-file opens and plugin tab creation/launch readiness.
- `src/tab/manager.test.ts`: close completion resolves after asynchronous workspace release while ordinary close still removes the tab immediately.

## Out of scope

- Tabs opened by user commands, other runs, or unrelated plugin actions.
- Transferring ownership when an existing tab is focused, updated, or shared.
- Changing agent command grants, plugin capability declarations, or public user documentation.
