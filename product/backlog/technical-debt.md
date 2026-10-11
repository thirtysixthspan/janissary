# technical-debt

## ready

## development

## deferred

* Bound Git sync commands and cancel queued work during shutdown. — deferred: complexity 8/10, requires owned cancellation and finite deadlines across the complete Git subprocess sequence, including status lookup, recovery, queue shutdown, and post-timeout outcomes.

Existing Debt: The shared Git sync queue serializes operations but gives its subprocesses no deadline or owned cancellation lifecycle, so one stalled command holds every subsequent cycle indefinitely. Severity: 6/10

Existing Risk: 6/10 - A hanging pull, push, hook, or credential helper can keep all synced editors provisioning or syncing indefinitely and leave Git work running while shutdown removes the shared clone.

Proposal Risk: 3/10 - A timed-out push can still have reached the remote before its reply was lost, so users may need to inspect the remote before retrying while local saves and commits remain available.

Proposal: Introduce a focused subprocess helper for `src/git/sync.ts` that applies explicit finite deadlines, tracks the active child, and settles only after the child has stopped. Route staging, diff, commit, pull, recovery abort, and push through it; extend the branch readers in `src/git/status.ts` with optional execution bounds so `readyBranch` cannot hold the same queue indefinitely. Add an idempotent `GitSync.dispose()` that marks the service closed, cancels active work, and makes queued operations return an error without starting another subprocess. `src/managers.ts` already places `gitSync` before `workspace` in `MANAGER_DISPOSE_ORDER`; preserve that lifecycle order. Failure recovery needs its own bounded command rather than inheriting an already-aborted signal, and `commitIfChanged` must distinguish the expected diff exit indicating staged changes from timeout, cancellation, or command failure. Preserve path-scoped commits, local history on rebase failure, and synchronous local save confirmation. `src/git/sync.test.ts` already holds commands to test queue ordering and recovery; extend its child-process fake to assert timeout settlement, recovery ordering, disposal with queued cycles, and refusal to commit after a failed diff. Keep `src/editor/save-synced-stale.test.ts` as the integration coverage for preserving local and upstream content.

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

## declined
