# technical-debt

## ready

## development

## deferred

* Derive the remote filesystem port's reply types from the operation table's own decoders instead of asserting each wire result into whatever the caller expected. — deferred: complexity 8/10, a keyed type mapping plus a result decoder for each of twenty operation entries, a module extraction to stay under the 200-line cap, and rewiring the remote-request surface across eight files.

Existing Debt: `src/remote/filesystem/operations.ts` validates every frame's arguments at runtime but its result side is untyped from the moment the reply leaves the channel, so `RemoteFileSystemPort.request` resolves `value as T` with `T` supplied purely by the declared return type of the calling method, leaving the validated shape and the wire shape as two type universes that meet only in a cast. Severity: 6/10

Existing Risk: 6/10 - Every one of the port's operations believes whatever the far side sent, so a mismatch between the reply the server builds and the reply the caller parsed is a silently mistyped object flowing into the file navigator, a `Record<string, RowStat | null>` read as something else or an `ok` flag that is not where the caller looks, with no runtime check and no compile-time link to catch it.

Proposal Risk: 3/10 - The reply type is then derived per operation, so a far-side payload change is a compile error at both ends, but the table now carries an argument and a result decoder per operation and that mapping has to stay in step with `RemoteFilesystemOperation`.

Proposal: `src/file-navigator/remote/port.ts:175` resolves each reply through `resolve(value as T)` inside `request`, and each caller, `readDirectory` among them, supplies `T` only through its own return type, while `src/file-navigator/remote/port-requests.ts:107` casts a value this codebase itself synthesized. `src/remote/filesystem/operations.ts` already holds each operation's argument `decode` and `valid`, so give each entry a result decoder beside them and expose a keyed mapping from `RemoteFilesystemOperation` to its decoded result type, which is the same unconnectedness the three `eslint-disable @typescript-eslint/no-explicit-any` suppressions at `src/remote/filesystem/operations.ts:94,213,223` are expressing on the argument side. Have `unavailableResult` at `src/file-navigator/remote/port-requests.ts:104-109` build its refusal through that decoder rather than `refusal.value as T`. `src/remote/file-navigator-refusal-contract.test.ts` runs every operation against a loopback remote and the local port and asserts the two answers match, and is the coverage that has to keep passing while the reply type stops being a cast.

* Bound Git sync commands and cancel queued work during shutdown. — deferred: complexity 8/10, requires owned cancellation and finite deadlines across the complete Git subprocess sequence, including status lookup, recovery, queue shutdown, and post-timeout outcomes.

Existing Debt: The shared Git sync queue serializes operations but gives its subprocesses no deadline or owned cancellation lifecycle, so one stalled command holds every subsequent cycle indefinitely. Severity: 6/10

Existing Risk: 6/10 - A hanging pull, push, hook, or credential helper can keep all synced editors provisioning or syncing indefinitely and leave Git work running while shutdown removes the shared clone.

Proposal Risk: 3/10 - A timed-out push can still have reached the remote before its reply was lost, so users may need to inspect the remote before retrying while local saves and commits remain available.

Proposal: Introduce a focused subprocess helper for `src/git/sync.ts` that applies explicit finite deadlines, tracks the active child, and settles only after the child has stopped. Route staging, diff, commit, pull, recovery abort, and push through it; extend the branch readers in `src/git/status.ts` with optional execution bounds so `readyBranch` cannot hold the same queue indefinitely. Add an idempotent `GitSync.dispose()` that marks the service closed, cancels active work, and makes queued operations return an error without starting another subprocess. `src/managers.ts` already places `gitSync` before `workspace` in `MANAGER_DISPOSE_ORDER`; preserve that lifecycle order. Failure recovery needs its own bounded command rather than inheriting an already-aborted signal, and `commitIfChanged` must distinguish the expected diff exit indicating staged changes from timeout, cancellation, or command failure. Preserve path-scoped commits, local history on rebase failure, and synchronous local save confirmation. `src/git/sync.test.ts` already holds commands to test queue ordering and recovery; extend its child-process fake to assert timeout settlement, recovery ordering, disposal with queued cycles, and refusal to commit after a failed diff. Keep `src/editor/save-synced-stale.test.ts` as the integration coverage for preserving local and upstream content.

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

## declined
