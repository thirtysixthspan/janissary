# Name the post-mutation invalidation in `FileNavigatorManager`

**Complexity: 3/10** — one new module holding the nine mutating operations and the invalidation rule they share, nine thin delegates left on the class, and tests that pin the invariant. No signature change on any public method, no wire-protocol change, and nothing a user can observe changes.

`src/file-navigator/manager.ts` writes the literal closure `() => { clearFilesystemCache(state); this.rebuild(label); }` nine separate times — once each in `move`, `moveMany`, `deleteMany`, `paste`, `undo`, `redo`, `rename`, `delete`, and `createDirectory`. It is not incidental duplication: it encodes the rule that every mutating operation must drop the tab's cached listings and stats *before* the tree is redrawn, because the mutation just invalidated them.

Because the rule lives only as copy-paste, the next mutating method added to this class can ship with a bare `() => this.rebuild(label)` and compile, lint, and pass review while leaving the navigator rendering the sizes, timestamps, and permissions of files that have since moved or been deleted.

## Goal

The invariant has a name. Each of the nine mutating operations passes `afterMutation(context, label, state)` instead of re-spelling the closure, so the rule is stated once, in one place, where a tenth mutating operation will find it.

## Design decisions

**A function that returns the callback, not one that is the callback.** Every call site hands its operation a zero-argument `onDone`-style callback, so `afterMutation(...)` returns `() => void` rather than performing the work itself. That keeps each call site a single expression, with no wrapper arrow around it, and leaves the operation modules' signatures untouched.

**`label` and `state` both stay parameters.** The two values come from different places: `label` is the caller's own argument, `state` is what `withFilesState` resolved from the tab map. There is no lookup that could derive one from the other without duplicating what `withFilesState` already did.

**A new `manager-mutations.ts`, not a private method on the class.** A private helper was the first shape tried, and it pushed `manager.ts` to 202 counted lines — two over the repo's `max-lines` ceiling, which the code guidelines say to answer by extracting a module rather than compacting what is there. `manager.ts` is already a facade over eight sibling `manager-*.ts` modules (`manager-batch`, `manager-history`, `manager-item-operations`, `manager-files`, `manager-close`, `manager-payload`, `manager-ports`, `manager-profile`, `manager-state`), so the nine mutating operations moving into a ninth sibling matches the structure that is already there instead of fighting it. It also puts the invariant and every operation that must obey it in the same file, which a private method beside unrelated watcher plumbing did not.

**One `MutationContext` rather than three arguments per call.** The moved functions need the tab map, the `Managers` handle (for `rename` and `createDirectory`), and a way to redraw. The class hands them all three as one object, so `manager.ts` keeps a single `mutationContext()` builder and the class's private `rebuild` stays private — reached only through a bound closure on the context.

**Ordering is preserved exactly.** `clearFilesystemCache(state)` then `rebuild(label)`, in that order — the rebuild re-reads only what the cache no longer holds, so clearing after rebuilding would repaint from the stale values and drop the fresh ones on the floor.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The cache-clearing function | `clearFilesystemCache` in `src/file-navigator/filesystem-cache.ts` |
| The private redraw | `FileNavigatorManager.rebuild` in `src/file-navigator/manager.ts` |
| The tab-state resolution each call site already does | `withFilesState` in `src/file-navigator/manager-state.ts` |
| The precedent for bound-closure helpers on this class | `portClosures()` in `src/file-navigator/manager.ts` |
| Row detail values driven by the stat cache | `markStats` in `src/file-navigator/stats.ts` |
| The manager's integration test harness | `src/file-navigator/manager.test.ts` |

## Implementation steps

1. **New module `src/file-navigator/manager-mutations.ts`.** It exports a `MutationContext` type (`managers`, `tabs`, `rebuild`), the module-private `afterMutation(context, label, state)` returning `() => { clearFilesystemCache(state); context.rebuild(label); }` with a comment stating the invariant, and one exported function per mutating operation — `moveItem`, `moveItems`, `deleteItems`, `pasteItems`, `replayMutation` (serving both undo and redo), `renameItem`, `deleteItem`, `createDirectoryIn` — each carrying over its current `withFilesState` wrapper and delegate call verbatim, with the inline closure replaced by `afterMutation(...)`.

2. **`manager.ts`: delegate.** Each of the nine methods keeps its signature and its doc comment and becomes a one-expression delegate to the new module, passing `this.mutationContext()`. Add a private `mutationContext()` returning `{ managers: this.managers, tabs: this.tabs, rebuild: (label) => this.rebuild(label) }`.

3. **Prune `manager.ts`'s imports.** The imports that now belong only to the moved code — `clearFilesystemCache`, `deleteMany`/`moveMany`/`pasteMany`, `replayHistory`, `deleteOne`/`moveOne`/`renameOne`/`unavailable`, `createNavigatorDirectory`, `withFilesState`'s mutation uses, and the `BatchResult`/`BulkMoveResult`/`UndoRedoResult`/`BulkConflictPolicy` types the delegates still need — are moved or kept per what each file actually references. `invalidateDirectory` is used by `scheduleRebuild` and stays.

## Tests

In `src/file-navigator/manager.test.ts`, a new `describe` block pinning the invariant across every mutating method. Each case opens a tree in `size` detail mode so the rows carry cached stat values, primes the cache by reading the built rows, changes a bystander file's size on disk behind the navigator's back, then invokes one mutating method and asserts the bystander row reports its **new** size — which can only happen if the cache was dropped before the redraw:

- `move` — moving a different file into a directory refreshes the bystander's cached size.
- `moveMany` — same, for the batch path.
- `deleteMany` — same.
- `paste` — same, for a copy-paste into the tree.
- `undo` and `redo` — same, replaying a recorded move.
- `rename` — same.
- `delete` — same.
- `createDirectory` — same.

The existing manager tests must all pass unchanged; they are the check that no behavior moved.

## Out of scope

- **`scheduleRebuild`'s `invalidateDirectory` call.** The watcher path deliberately invalidates one directory rather than the whole cache, and that difference is intentional, not duplication.
- **`setDetail` and the navigation methods** (`toggle`, `collapseAll`, `reroot`, `reveal`, `restoreView`), which do not mutate the filesystem and correctly do not clear the cache. `reroot` resets tab state through `navigation.ts` on its own path.
- **Changing when the cache is cleared, or clearing it more narrowly per mutation.** A mutation could in principle invalidate only the affected directories; that is a different, behavior-affecting change.
- **The remote port's own caching** (`src/file-navigator/remote-file-cache.ts`), which is a separate cache with a separate lifetime.
