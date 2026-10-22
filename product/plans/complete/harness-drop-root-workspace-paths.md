# Type dropped file paths into a harness as `$root` / `$workspace` paths

**Complexity: 3/10** — a path-formatting change in the web client plus one optional field on the tab view.

Dropping a file-navigator selection over a harness terminal types each path relative to the *active* tab's working directory (`targetCwd`), so the same drop yields `../../src/a.ts` or `a.ts` depending on where the user happens to be. The backlog wants paths anchored to the harness's workspace with the `$root` / `$workspace` shortcuts the metadata row already uses.

## Goal

A local drop into a harness types, for each path:

- `$workspace/<clone-name>/<rest>` when the harness is a local workspaced tab and the file is inside its clone;
- otherwise the tree's own display root plus the row path (`$root/src/a.ts`; `~/…` or an absolute path where the server's root abbreviation yields those).

A remote tree keeps `<host>:<absolute-remote-path>`. Separator, focus move and "nothing submitted" are unchanged.

## Approach

1. `src/protocol/tab.ts` / `src/tab/view.ts`: expose the tab's local clone directory as optional `workspaceDir` on the tab view (only when set).
2. `web/src/shared/drop-handles.ts`: `HarnessDropHandle` gains optional `workspaceDir`. `useHarnessPtyDrop` takes it and publishes it; `HarnessTab` / `HarnessTabLayer` pass `t.workspaceDir`.
3. `navigator-relative-path.ts`: replace `joinCommandPaths` / `relativeNavigatorPath` (now unused) with `joinHarnessPaths(absoluteRoot, displayRoot, sourcePaths, workspaceDir, remoteHost)`.
4. `useFileNavigatorDrag`: the harness branch calls `joinHarnessPaths` with the handle's `workspaceDir`. Remove the now-unused `targetCwd` option and its plumbing (`FileNavigatorTab`, tab types, `Sidebar`, `AppShell`, `AppMain`).

## Tests

- `navigator-relative-path.test.ts`: `joinHarnessPaths` for display-root paths, workspace-clone paths, a file outside the clone, and remote.
- `useFileNavigatorDrag.test.ts`: harness drop types `$root/...` and `$workspace/...` forms.
- `useHarnessPtyDrop.test.ts`: the registered handle exposes `workspaceDir`.
- `src/tab/view.test.ts`: `workspaceDir` present when set, absent otherwise.

## Specs and docs

Update the harness-drop paragraphs in `product/specs/file-navigator-tab.md` and `product/specs/harness.md`.

## Out of scope

Command-bar and editor drops; remote-clone `$workspace` forms.
