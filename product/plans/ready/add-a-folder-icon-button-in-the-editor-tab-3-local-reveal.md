# Local reveal

**Complexity: 3/10** — ~50 added lines, 1 file, 5 requirements, 7 test scenarios, 2 new units (p=4.78). One ordered sequence in an existing new module, with the expand step and the hint writer reused rather than rebuilt.

## Goal

Implement `revealEditorFile` for a local edited file. It finds the editor by label, resolves the navigator root with the rule from `01`, opens or retargets the navigator, expands every ancestor of the file, writes the restore hint that selects it, and activates a centre-strip navigator. A remote cached file is left untouched here until `04-remote-reveal` adds its branch.

## Design decisions and dependencies

This subplan depends on `add-a-folder-icon-button-in-the-editor-tab-1-reveal-target-and-blocked-state` for `revealTargetFor` and `editorRevealBlocked`, and on `add-a-folder-icon-button-in-the-editor-tab-2-open-or-retarget-at-a-root` for `openOrRetargetLocalAt`. `04-remote-reveal` replaces the temporary remote guard described below. `05-reveal-rpc` supplies the production caller. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`, and this is its "Reveal" step for the local case.

- `revealEditorFile(port, editorLabel)` lives in `src/file-navigator/reveal-editor.ts` and returns nothing. Its port is an exported alias, `RevealPort`, in that module: `OpenPort` (`src/file-navigator/open.ts:12`) intersected with `Pick<NavigationPort, 'setCwd' | 'hasTab' | 'reportFailure'>`. Those three extras are needed only because `revealPath`'s declared parameter is `NavPort` (`src/file-navigator/navigation.ts:150`), which is `NavigationPort`; the call itself reads just `states`, `watchDir`, and `rebuild`. `RevealPort` is structurally a `NavPort`, so `revealPath(port, label, relPath)` typechecks with no cast, and it is also an `OpenPort`, so `openOrRetargetLocalAt(port, root)` accepts it. `05` supplies the value as `{ ...this.openPort(), ...this.navPort() }` from a private `revealPort()` on `FileNavigatorManager` (`navPort` at `src/file-navigator/manager.ts:75`, `openPort` at `:107`), so neither `OpenPort` nor `NavPort` is widened. Do not type the parameter as a bare `OpenPort`: `revealPath` then fails to compile.
- Step 1, find the editor. `port.managers.tab.byLabel(editorLabel)` must exist and carry `editor`; otherwise return silently. Then `editorRevealBlocked(editor)` must return `undefined`; otherwise return silently. The client disables the button in those states, so these are guards, not user paths.
- Step 2, pick the root and the path. For a file that is not a remote cache file, `const clone = localCloneOf(editor.path)` and `revealTargetFor(editor.path, { clone, root: port.managers.tab.launchDir })`. `editor.path` here is the stored `Tab.editor.path`, which is already absolute: `buildTabView` shortens only its own copy at `src/tab/view.ts:170`, and this code reads the record that `byLabel` returned, so it must not un-shorten, expand `~`, or otherwise re-resolve the path. Pass the result's `navigatorRoot` to `openOrRetargetLocalAt`. An `undefined` label stops here with no hint written and nothing reported, and `02` has two `undefined` causes: the resolved root is not a directory at call time (the source plan's missing-root rule), or the most recently focused navigator label has no live state.
- Temporary remote boundary. When `isRemoteCacheFile(editor.path)` holds and `remoteFileFor(editor.path)` finds a record, return without acting. Without this guard the cache path would take the local rule: it sits under `<project>/.janissary/remote-files`, so `revealTargetFor` would root the navigator at `$root` and select a `.janissary/remote-files/...` cache artifact instead of the remote file. `04` removes the guard and adds the real branch. A remote cache file with no record never reaches here, because `editorRevealBlocked` already returned `'no-route'`.
- Step 3, expand the ancestors. Call `revealPath(port, label, relPath)` unchanged, the same call the search pop-up's Enter makes (`web/src/file-navigator/useFileNavigatorSearch.ts:49` sends the RPC that reaches it). It adds each ancestor to `expanded`, watches the newly expanded ones, and rebuilds. No existence check is added, because that rebuild prunes: `writeRebuiltPayload` runs `pruneAndBuildRows` (`src/file-navigator/rebuild.ts:8`), which calls `pruneCachedRows` (`src/file-navigator/filesystem-cache.ts:103`). A directory missing from the rows built off its cached parent listing is dropped from `expanded`, and its watcher is released through the state-level `unwatchDir` (`src/file-navigator/watch.ts:44`) — not `port.unwatchDir` — so the tree collapses away silently. The drop needs the parent listing to be in the cache; a local port lists synchronously, so it is.
- Step 4, write the hint. After the rebuild, look up `port.states.get(label)`. If the state is gone, return. Set `state.restore` to `{ revision: nextRestoreRevision(), cursor: relPath, anchor: relPath, selected: [relPath] }` and then `port.rebuild(label)`. The hint is written even when the file or an ancestor is missing; the client simply never finds the row, which is the source plan's silent outcome. This subplan's hint carries no `focus` member; `06` adds it.
- Step 5, show the navigator. Call `port.managers.tab.setActiveTab(port.managers.tab.findIndex(label))`. A centre-strip navigator becomes the active tab. A docked navigator is a no-op because `setActiveTabOp` returns early for a docked tab (`src/tab/navigation-commands.ts:25`, `if (tabs[index]?.dock || tabs[index]?.hidden) return;`); the sidebar host selects it from the hint in `11`.
- A fresh navigator is opened docked left by `openOrRetargetLocalAt`, so the editor stays visible in the centre. A retargeted one keeps its position and dock placement.
- The function reports nothing and notifies nothing. Every outcome is either a visible tree change or silent, per the source plan's "Out of scope".
- `reveal-editor.ts` is near 55 raw lines after `01`; this subplan takes it to about 110, still under the 200-line limit. If a later subplan crosses the limit, the reveal sequence moves to a sibling module in the same directory rather than being compacted.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Target and blocked rules | `src/file-navigator/reveal-editor.ts` (from `01`) | Called as the first two steps. |
| Open or retarget at a root | `src/file-navigator/open.ts` (`openOrRetargetLocalAt`, from `02`) | Opens or retargets and returns the label. |
| Ancestor expansion | `src/file-navigator/navigation.ts:150` (`revealPath`), line 139 (`expandAndWatch`) | Called unchanged. |
| Rebuild pruning | `src/file-navigator/rebuild.ts:8` (`pruneAndBuildRows`) → `src/file-navigator/filesystem-cache.ts:103` (`pruneCachedRows`) | Supplies the missing-ancestor behavior and releases the watcher from `state.watchers`; no check is added. |
| Restore revision | `src/file-navigator/restore.ts:30` (`nextRestoreRevision`) | Fresh revision for the hint. |
| Restore hint shape and writer precedent | `src/tab/types.ts:174` (`FileNavigatorRestoreHint`), `src/file-navigator/restore-command.ts:53` (`restoreHint`) | Same shape and same "new revision per applied view" rule. |
| Active-tab guard | `src/tab/navigation-commands.ts:18` (`setActiveTabOp`), the dock check at `:25` | Makes the docked case a no-op without a branch here. |
| Editor lookup | `src/tab/manager.ts:114` (`byLabel`) | Finds the editor tab and its stored absolute `editor.path`. |
| Test harnesses | `src/file-navigator/restore-command.test.ts:14` (`navigator`), `src/file-navigator/open.test.ts:39` (`makeManagers`) | The real-tree state and port shape, and the tab-manager fake the new reveal test extends. |

## Proposed changes

In `src/file-navigator/reveal-editor.ts`:

- Add the exported `revealEditorFile(port, editorLabel)` with the five ordered steps above.
- Export the `RevealPort` alias beside it and use it as the parameter type; do not add a second copy of the target rule. It is the module's only new type, and exporting it lets the test type its fake with the same name rather than casting.
- Import `revealPath` from `./navigation.js`, `openOrRetargetLocalAt` and its `OpenPort` type from `./open.js`, `localCloneOf` from `../plugins/origin-workspace-records.js`, `nextRestoreRevision` from `./restore.js`, `isRemoteCacheFile` and `remoteFileFor` from `./remote/file-cache.js`, and the `NavigationPort` type from `./port.js`, all with `.js` extensions. `NavigationPort` is a type-only import; the rest are values except `OpenPort`, which is also type-only.
- Keep the disabled helper and the target rule exactly as `01` left them; this subplan only adds the sequence that consumes them.

## Tests

In `src/file-navigator/reveal-editor.test.ts`, beside the `01` cases:

- A local nested file expands each ancestor directory, writes a hint whose `cursor`, `anchor`, and `selected` all name the file's tree-relative path, and uses a fresh revision. Assert the fields rather than the exact object, so `06` can add `focus` without rewriting this case.
- A missing intermediate directory leaves no stale entry in `expanded` after the rebuild, and the hint is still written. Build the tree with a real temporary directory and delete the intermediate directory before the call. The fake `rebuild` must run `pruneAndBuildRows(state, () => {})` rather than being a bare spy, or nothing prunes and the case proves nothing — this is the one place the fake has to do real work.
- An unknown editor label, a label naming a non-editor tab, and a blocked editor each change nothing: no navigator opens, no state changes, no hint is written.
- A missing resolved root opens nothing and writes no hint. Build it without touching the disk: point the fake `launchDir` at a path that does not exist and give the editor a path lexically inside it, so `revealTargetFor` selects that root and `openOrRetargetLocalAt` refuses it.
- `setActiveTab` is called once with the navigator's index, for a navigator in the centre strip and for a docked one. The docked no-op lives in `setActiveTabOp`'s guard (`src/tab/navigation-commands.ts:25`) and is already covered in the tab tests, so this case asserts the call and its index, not the tab's placement.
- The fake port is `restore-command.test.ts`'s `navigator()` shape: a real temporary tree, a `freshFileNavigatorState` on `LocalFileSystemPort`, and spies for `watchDir` and `rebuild`, extended with `managers`. Follow `open.test.ts`'s `makeManagers` (`:39`) for the tab-manager fake, adding an `editor` payload to its source tab, since `byLabel` must return the edited tab, and making its `launchDir` the value under test. Do not start from `open.test.ts`'s `makePort` alone: it has no filesystem port behind `state`, so nothing can list or prune. The controller and manager wiring is not part of this test; `05` covers the RPC reaching this function.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and `npx vitest run --project server src/file-navigator/reveal-editor.test.ts src/file-navigator/open.test.ts`. Read the diff to confirm the expand step is the existing `revealPath` call, that the missing-ancestor case adds no existence check, and that the only activation is the final `setActiveTab`.

There is no manual end-to-end check at this stage: nothing calls `revealEditorFile` in production until `05` exposes it, and no button exists until `08`. `13-end-to-end-verification` owns the user-visible check; do not add a temporary caller or debug command here.

## Out of scope

- No remote branch and no re-root; `04` owns those. The temporary guard described above is the only remote-related line here and is removed there.
- No focus flag, no client focus, and no acknowledgement; `06` and `07` own those.
- No RPC, no controller, adapter, or manager method; `05` exposes this function.
- No button, key binding, sidebar selection, or documentation.
- No notification and no error report for any outcome, including a file missing on disk.
- The reveal only locates the file. It does not open, rename, commit, or otherwise act on it from the navigator, and it does not select a not-yet-saved new file's target directory.
- No change to `revealPath`, `pruneCachedRows`, the search pop-up, or the `files` command's restore.
