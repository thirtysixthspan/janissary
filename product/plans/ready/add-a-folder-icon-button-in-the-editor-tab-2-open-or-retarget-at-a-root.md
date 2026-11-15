# Open or retarget at a root

**Complexity: 3/10** — ~35 added lines, 1 file, 6 requirements, 7 test scenarios (p=4.81). A pure extraction of the existing local branch, with the returned label and the stop-on-`undefined` rule as the only new contract.

## Goal

Extract the local open-or-retarget step from `openOrRetarget` into an exported `openOrRetargetLocalAt(port, root)` so the reveal path can call it with a resolved root instead of a source tab. The shell and harness folder button keeps its behavior exactly, including its final activation of the source tab.

## Design decisions and dependencies

This subplan depends on nothing earlier, and `add-a-folder-icon-button-in-the-editor-tab-3-local-reveal` imports the new function, so this lands before `03`. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`, and its "Server code location" decision is this subplan's whole purpose. `openLocal` has exactly one caller today, `openOrRetarget` (`src/file-navigator/open.ts:16`); every user-facing route reaches it through `FileNavigatorManager.openOrRetarget` (`src/file-navigator/manager.ts:101`), so no other call site needs touching. Each checkpoint stays green: after this subplan the new function is already used by `openOrRetarget`, and `03` adds its second caller.

- `openOrRetargetLocalAt(port, root)` is exported from `src/file-navigator/open.ts` and returns the navigator's tab label, or `undefined` when nothing was opened or retargeted. It is the function `openOrRetarget` calls for a local source tab, and it takes only the root — it does its own `port.managers.tab.mostRecentFileNavigatorLabel()` lookup because `03` has no source tab to read one from.
- The directory check stays in `open.ts`, as the private `localDirectory` (`src/file-navigator/open.ts:26`, `statSync(root).isDirectory()` in a try), and becomes the first step of `openOrRetargetLocalAt`; `openOrRetarget` stops calling it directly. A root that is not a directory at call time returns `undefined` before anything is touched. That is the source plan's missing-root rule and the behavior `openOrRetarget` already has for a shell tab whose cwd has gone. This moves the check ahead of the most-recent lookup, where `openOrRetarget` currently does the lookup first (`src/file-navigator/open.ts:20`) and the check second (`:22`). The reorder is unobservable: `mostRecentFileNavigatorLabel` is a pure scan that does not mutate the focus history (`src/tab/focus-history.ts:40`, "without mutating it").
- When `port.managers.tab.mostRecentFileNavigatorLabel()` names a navigator with live state, the function follows the existing rule: `releaseRemote` the tie, then `retarget` to the new root with a fresh `LocalFileSystemPort`, which clears expanded directories, watchers, the filesystem cache, and the move undo/redo stacks (`src/file-navigator/open.ts:104`). It returns that existing label. Identity, dock placement, and strip position are untouched because `retarget` mutates the existing state in place. The retarget runs even when the existing navigator is already rooted at `root`: there is no same-root short-circuit, so its expanded set and undo/redo history still clear, exactly as the source plan requires.
- When that most-recent label has no state left, the function returns `undefined` and changes nothing. The real case is an open files tab with no state behind it — a remote navigator whose `attach` was refused (`src/file-navigator/open.ts:60`, `if (!port.managers.remote.attach(label, ownerLabel)) return;` leaves the tab open with no state registered) — and a unit test can seed the same shape. `retarget` would already no-op for a missing state; returning `undefined` makes that explicit to the reveal, which then stops instead of expanding ancestors in a tree that does not exist. `openOrRetarget` is unaffected, because it only activates the source tab afterwards. Callers treat `undefined` as "stop", not as "missing root"; `03-local-reveal` relies on that.
- `openOrRetarget` keeps its own `mostRecentFileNavigatorLabel` read (`src/file-navigator/open.ts:20`) because `openRemote` needs `existing`, so the local path reads it twice. That duplicate read is harmless: both calls are synchronous and nothing mutates the tab manager between them. Do not widen the new function's signature to accept `existing` — `03` calls it with the root only.
- When no navigator is open, the function builds a fresh state with `freshFileNavigatorState` and `buildCachedRows`, calls `openFilesTab`, takes the label from `port.managers.tab.cur().label`, runs `registerOpenedTab` (cwd, state, root watcher, git refresh, docked left), and returns that label. That is today's `openLocal` fresh-open branch, unchanged.
- The function never activates a tab. `openOrRetarget` keeps its last step, `port.managers.tab.setActiveTab(port.managers.tab.findIndex(label))`, so clicking the shell or harness folder button still focuses the tab whose button was clicked. The reveal wants the navigator activated instead, so activation must stay out of the shared function.
- The remote branch of `openOrRetarget` (`openRemote`, `updateRemoteRoot`, and the release and attach steps) does not move and does not change.
- Load-bearing invariant: `openOrRetarget`'s outcomes for every existing case are byte-for-byte the same, including the two silent no-ops (unknown label, non-directory cwd) and the activation call that happens even when nothing opened. The existing `open.test.ts` cases are the guard.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Open-or-retarget entry point | `src/file-navigator/open.ts:16` (`openOrRetarget`) | Modified to call the extracted function for its local branch. |
| Existing local fresh-open branch | `src/file-navigator/open.ts:30` (`openLocal`) | Becomes the body of `openOrRetargetLocalAt`; the fresh-open steps are unchanged. |
| Existing local retarget branch | `src/file-navigator/open.ts:104` (`retarget`) | Called unchanged; it already clears expanded state, caches, watchers, and undo/redo. |
| Remote release | `src/file-navigator/open.ts:96` (`releaseRemote`) | Called unchanged before a local retarget, as today. |
| Fresh state and dock registration | `src/file-navigator/open.ts:67` (`registerOpenedTab`), `src/file-navigator/state.ts:14` (`freshFileNavigatorState`) | Called unchanged for a fresh open. |
| Most-recent navigator lookup | `src/tab/manager.ts:163` (`mostRecentFileNavigatorLabel`) | Called by the function, as today. |
| Existing open tests | `src/file-navigator/open.test.ts` | Every existing case must pass unchanged; new cases are added beside them. |

## Proposed changes

In `src/file-navigator/open.ts`:

- Export `openOrRetargetLocalAt(port: OpenPort, root: string): string | undefined` from `src/file-navigator/open.ts`, in the place `openLocal` occupies today. Its body is the current `openLocal` body wrapped by the directory check first and the return values described above: `undefined` for a non-directory root or a most-recent label with no state, the most-recent label after a retarget, and the new tab's label after a fresh open.
- Delete the private `openLocal` outright rather than keeping it as a wrapper, and leave `localDirectory` private in the same file, called only by the new function. No import changes are needed: `statSync`, `LocalFileSystemPort`, `buildCachedRows`, and `freshFileNavigatorState` are already imported at the top of the file.
- In `openOrRetarget`, replace the local branch (`else if (localDirectory(cwd)) openLocal(port, cwd, existing)`) with `else openOrRetargetLocalAt(port, cwd)`, so the directory check no longer appears there. Keep the `existing` read on the line above for `openRemote`, leave the `setActiveTab` call in place, and leave the remote branch and the unknown-label return as they are.
- Do not change any signature of `openOrRetarget`, `retarget`, `releaseRemote`, or `registerOpenedTab`.
- The file is 124 raw lines today; the extraction keeps it well under the 200-line `max-lines` budget, since moved lines are not new lines. No new module is needed.

## Tests

In `src/file-navigator/open.test.ts`, import `openOrRetargetLocalAt` beside `openOrRetarget` from `./open.js`, and add the cases beside the existing ones, reusing that file's `makePort`, its `makeManagers` options (`source`, `existing`), and its `tree()` temporary directories:

- A fresh open at a given root opens one navigator, registers its state at that root, watches it, refreshes git, sets the cwd, docks it left, and returns its label. Assert `setActiveTab` was not called, since activation belongs to `openOrRetarget`.
- With an existing most-recent navigator, the call retargets that label instead of opening a second one, sets its root, returns the same label, and does not re-dock it. Seed the state with an expanded entry and non-empty undo and redo stacks, then assert all three are cleared by `retarget`.
- A most-recent navigator already rooted at the target still takes the retarget and still clears its expanded set and undo/redo stacks, proving there is no same-root short-circuit.
- A missing root returns `undefined`, opens nothing, and leaves the state map empty.
- A missing root with an existing most-recent navigator also returns `undefined` and leaves that navigator's root, expanded set, and watchers untouched: seed the state as in the retarget case, pass a path that does not exist, and assert `unwatchDir` and `rebuild` were not called.
- A most-recent label with no state returns `undefined`, opens nothing, and changes no watcher or cwd. `makeManagers({ existing: 'files-1' })` alone produces this shape, as the existing `openOrRetarget` case at `src/file-navigator/open.test.ts:263` already does.
- Every existing `openOrRetarget` case still passes, unchanged: the unknown-label case, the non-directory cwd case (which also asserts `setActiveTab` is still called when nothing opens), both remote cases, the attach-refusal cases, and the handshake re-root case.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and `npx vitest run --project server src/file-navigator/open.test.ts`. Read the diff to confirm the only behavior change is the returned label and that `openOrRetarget` still calls `setActiveTab` after the extracted step.

Then check it by hand, with the app started through `ai/tasks/workspace/start-application.md`: from a shell tab whose cwd is a real directory, click the 📁 button in the metadata row — the navigator opens docked left on that directory, and focus stays on the shell tab. Click it again from a second shell tab on a different directory — the same navigator retargets, keeps its dock and strip position, and focus again stays on the shell tab that was clicked. Point a shell tab at a deleted directory and click — nothing opens, nothing changes, and focus still stays put.

## Out of scope

- No reveal logic, no restore hint, and no editor lookup. `03` adds the caller.
- No manager, controller, RPC, or client wiring: `openOrRetargetLocalAt` is exported for `03` and has no other caller until it lands.
- No change to the remote open or retarget path, the workspace handshake, or the remote file cache.
- No change to which navigator is chosen or what a retarget clears; those rules are reused exactly.
- No client code and no specification change.
