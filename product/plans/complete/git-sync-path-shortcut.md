# `$git-sync` path shortcut

Issue: add a file path shortcut `$git-sync` for `$root/workspace/git-sync` with priority over `$root`, to be used in all places where file paths are shown, including the editor tab metadata bar.

Complexity rating: 2/10

## Goal

Every git-synced editor tab edits a file inside the one shared git-sync workspace clone at `<root>/.janissary/workspace/git-sync`. Today its metadata bar reads `$root/workspace/git-sync/product/backlog/issues.md` — long, and it hides the one fact worth knowing (this is the synced copy) behind generic workspace plumbing. Show that clone as `$git-sync` instead (`$git-sync/product/backlog/issues.md`), winning over `$root` for any path at or under it, wherever the application renders a path.

## Approach

The shortcut is display-only, like `$workspace/<name>`: nothing expands `$git-sync` back into a path, and stored state keeps absolute paths.

- **Host display.** Add `abbreviateDisplayPath(p, context)` to `src/paths.ts`. It reads the shared clone (`<root>/.janissary/workspace/<SYNC_WORKSPACE_NAME>`) as `$git-sync/` and anything under it as `$git-sync/<rest>`, and otherwise delegates to `abbreviatePath`. `TabManager.shorten` switches to it, which covers every host consumer at once: the editor metadata bar's path, the file navigator root (and its failure messages through `file-navigator/manager/ports.ts`), each prompt's working directory in the transcript, the tab's `cwd`, and the connections panel.
- **`abbreviatePath` itself stays unchanged.** `profile save`'s `portablePath` uses it to write paths a later launch expands with `expandUserPath`; a `$git-sync` prefix written there would not expand. Synced editors already save their project-relative source path through `syncedSourcePath`, so profile behavior is untouched.
- **Plugin-local formatters.** The shell plugin's metadata row (`web/src/plugins/shell/format-shell-cwd.ts`) and the diff plugin's header (`src/plugins/diff/display.ts`) each abbreviate paths locally because the plugin import boundary closes the host's `src/paths.ts`. Each gains the same `$git-sync` rule, checked after the tab's own `$workspace` clone and before `$root`. They spell the clone's directory name (`git-sync`) locally, the same way they already spell `.janissary` and `$workspace`.

`SYNC_WORKSPACE_NAME` is imported into `src/paths.ts` from `src/git/sync.ts`; the import graph is checked for cycles with `npx madge --circular --extensions ts,tsx src`.

## Implementation steps

1. `src/paths.ts`: add `abbreviateDisplayPath` with a comment describing the `$git-sync` priority; import `SYNC_WORKSPACE_NAME`.
2. `src/tab/manager.ts`: `shorten` calls `abbreviateDisplayPath`.
3. `web/src/plugins/shell/format-shell-cwd.ts`: after the workspace check, read the shared clone under the state directory as `$git-sync/…`.
4. `src/plugins/diff/display.ts`: after the workspace check, read the shared clone under the launch directory as `$git-sync/…`; update the comment's vocabulary list.

## Tests

- `src/paths.test.ts` — `abbreviateDisplayPath`: the clone itself reads `$git-sync/`; a file under it reads `$git-sync/product/backlog/issues.md`; a sibling clone sharing the name as a prefix (`git-sync-old`) keeps the `$root/workspace/…` form; ordinary root, state-directory, and home paths match `abbreviatePath`; `abbreviatePath` itself still reads the clone as `$root/workspace/git-sync`.
- `src/tab/manager.test.ts` — `TabManager.shorten` reads a synced file inside the clone as `$git-sync/…` and a project file as `$root/…`.
- `web/src/plugins/shell/format-shell-cwd.test.ts` — a cwd at and below the clone reads `$git-sync/` and `$git-sync/<rest>`; `git-sync-old` keeps `$root/workspace/git-sync-old`; a shell workspaced in its own clone still reads `$workspace/<name>`.
- `src/plugins/diff/display.test.ts` (new) — `displayRoot` reads the clone and a path below it as `$git-sync/…`, still reads the tab's workspace as `$workspace/<name>`, and still reads an ordinary project path as `$root/…`.

## Out of scope

- Typing `$git-sync` as an input prefix (`open`, `edit`, `files`) — the shortcut is display-only, matching `$workspace`.
- `profile save` path portability (`portablePath`, `syncedSourcePath`).
- The diff header's existing handling of other `.janissary` paths (it does not elide the state directory) — unchanged apart from the git-sync clone.
- Remote hosts: the shared git-sync clone is local only.

## Specs and docs

- `product/specs/root-path.md`: new "The git-sync symbol" subsection; the "Where it applies" list names the editor metadata header's synced file.
- `product/specs/shell-tab.md`, `product/specs/diff-tab.md`, `product/specs/editor-tab.md`: the shortcut lists gain `$git-sync`.
- `documentation/user-documentation/getting-started/tabs.md` ("How paths are shown"), `documentation/user-documentation/command-bar/shell.md`, `documentation/user-documentation/tab-types/diff.md`: same wording update, in place.
- `help.md`: does not document path abbreviations; no update.
