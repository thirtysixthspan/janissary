# One owner for the file navigator's re-root sequence

## Complexity

5/10 — one sequence extracted, three call sites converged, two `freshState` constructors merged, and two suites' expectations tightened. The remote half is a deliberate behavior change: those paths gain the git half they never had.

## Goal

Three modules implement "move this tree to a new root": `rerootTree` in `src/file-navigator/navigation.ts` is the full sequence, while `updateRemoteRoot` in `src/file-navigator/open.ts` and the inline `ready.then` in `src/file-navigator/open-command.ts` are two further copies that each omit the git half, and the two constructors that build the record they re-root are written twice as well. A remote files tab that settles onto a workspace never re-reads git metadata for it, because both remote copies run `refreshGit` for the fallback root before the handshake resolves and nothing re-runs it after, so `git-refresh.ts` discards the in-flight result on its root guard and the previous root's branch and statuses stay on screen until an unrelated watcher event, pull or commit happens to fire one.

## Approach

Extract the canonical sequence into `reRootTree(port, label, state, root)` beside it in `navigation.ts`, taking the new root as an argument rather than deriving it, and have all three paths call it. `rerootTree` stays the local caller: it resolves the target, reports an escaping one, and reads the new root's listing first so the tree has content the moment it rebuilds. The divergent watcher handling each remote copy holds — `port.unwatchDir(state, '')` in one, the full `watchers.values()` loop in the other — is deleted in favour of the canonical drop-expanded-then-unwatch-root, which also clears the stale `expanded` set the command path left behind. Both `freshState` constructors merge into one factory in `src/file-navigator/state.ts`, so a new `FilesTabState` field is added once rather than in two constructors that already disagree over `gitStatuses`. Each remote path keeps its own condition for when a re-root happens at all — a root that already matches rebuilds without moving — and only takes the full sequence when it does not.

## Implementation

1. In `src/file-navigator/state.ts`, add `freshFileNavigatorState(root, filesystem, details = 'name', remote?, ownerLabel?)`, the union of both constructors' field lists, carrying `gitStatuses: new Map()` the way the command path's copy did.
2. In `src/file-navigator/navigation.ts`, narrow `dropExpandedWatchers`' port parameter to the `unwatchDir` member it uses, add the `ReRootPort` member set the sequence needs (`unwatchDir`, `watchDir`, `setCwd`, `rebuild`, `refreshGit`, `hasTab`), and add `reRootTree(port, label, state, root, entries?)` holding the sequence: drop expanded watchers, unwatch the root, move the root, clear `gitStatuses`/`branch`/`gitMetadataLoaded`, clear the filesystem cache, write a caller-supplied listing when it has one, re-watch, set the tab's cwd when the tab exists, rebuild, and refresh git. Rewrite `rerootTree` to resolve the target, run the remote escape check, read the new root, and delegate.
3. In `src/file-navigator/open.ts`, use the shared factory in both `freshState` call sites, and have `updateRemoteRoot` call `reRootTree` when the root moves — adapting `OpenPort` with the `setCwd`/`hasTab` closures the sequence needs — keeping the set-cwd-then-rebuild tail for a root that already matches.
4. In `src/file-navigator/open-command.ts`, use the shared factory in both `freshState` call sites, and have the `ready.then` block call `reRootTree` through an adapter assembled from its own callbacks, `watch.ts`'s `unwatchDir`, and the managers — replacing the divergent watcher loop — keeping the rebuild for a root that already matches.
5. Run `./scripts/run.mjs check-diff` after the factory, after the sequence, and after each rewired path.

## Tests

- `src/file-navigator/open.test.ts` ("re-roots onto the workspace once the handshake settles") gains the git half: the settled state carries a fresh `gitStatuses` map, no branch, `gitMetadataLoaded` false, and `refreshGit` was called for the new root. Its existing watchDir/setCwd/rebuild assertions stay as they are.
- `src/file-navigator/open-command.test.ts` ("re-roots the tree onto the workspace once it resolves to a different directory") stages its watcher the way production does — an entry in `expanded` beside the watcher — so the canonical drop stops it, and gains the git half alongside its existing stop/watcher/watchDir/rebuild assertions. Its "keeps a tree whose root already matches the workspace, and rebuilds it" case must keep its no-move contract.
- `src/file-navigator/navigation.test.ts` is the coverage of the local reroot the extraction must not disturb and passes unchanged.

## Out of scope

- The remote-escape check and target resolution, which stay the local caller's.
- `src/file-navigator/remote-cwd.ts`'s `path.posix` spelling and any other module's watcher bookkeeping.
- The command path's state-identity guard (`current !== state`), which stays where it is.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A search for `gitStatuses = new Map()` finds the sequence and the factory, and no third spelling.
- Both remote suites assert the same contract the local one does, so the three paths can no longer drift over the git half.

## Documentation and specification impact

The remote re-root now re-reads git metadata, which is the fix: a remote workspace settling onto a different root shows its own branch and statuses instead of the fallback root's. `product/specs/` carries no per-path re-root contract to update, and `help.md` and the user documentation describe the file navigator's behavior, not which code path performs it — so no documentation changes are needed beyond the behavior already described.
