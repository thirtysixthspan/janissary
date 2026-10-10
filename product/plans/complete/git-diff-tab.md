# git diff tab

**Complexity: 7/10** — a new bundled plugin spanning both trees with a new core RPC, a new optional client capability, and two new metadata-row buttons; the diff parsing and the untracked-file handling are the real work, and no new plugin-API capability and no new wire type are needed, because the payload rides the existing plugin tab envelope and the intents ride `pluginIntent`.

A **diff tab** inspects the changes in the workspace as a tab instead of as terminal output. It renders those changes the way GitHub renders the files-changed view of a pull request: one entry per changed file, showing the file's name and the shape of its change, and beneath it the diff hunks with added and removed lines distinguished. Clicking a file's entry opens that file in an editor tab. Double-clicking an added or context line takes the user to that position in the changed file; removed lines are inert.

Today the only way to inspect what changed in a workspace is to type `git diff` into a shell tab and read the wall of unified-diff text it prints, with no path-to-line affordance: nothing in that output is clickable, and reaching the line a hunk concerns means re-finding it by hand in the editor. With agents editing files on the user's behalf, "what just changed, and where" is a question the app is asked constantly, and it currently leaves the app to answer.

## Product decisions

Each of the following was answered by the user during planning and is binding on the implementation.

### Opening routes

Two routes open the tab. A **`diff` command** typed in any tab's command bar opens or focuses the tab, scoped to a directory: run bare it diffs the project's launch directory, and given a path argument it diffs that subtree. A **metadata-row button** on shell and harness tabs that have a workspace opens the tab scoped to that tab's own workspace directory, which is the environment the tab is working in.

### The change set

All changes versus `HEAD` — staged and unstaged shown together, including untracked files as all-added entries, the way GitHub's files-changed view shows every change in a pull request. A binary file is one entry naming it as binary, with no hunks, and that entry opens the media tab the file's extension already opens — image, video, audio, or pdf — rather than an editor tab.

### Updating

The tab recomputes every second while mounted, so the visualization updates dynamically as files change. Re-running the command recomputes as well. There is no manual refresh button.

### One tab at a time

The tab is a singleton. A second route — a different path argument, or another workspace tab's button — re-scopes the open tab to the new root and repaints it in place rather than opening a second diff tab.

### Edge states

- A directory outside a git repository shows **This directory is not a git repository** in the tab body.
- A directory with no changes shows **No changes**.
- A renamed file is one entry carrying its old and new path with only its changed hunks; a deleted file is an entry whose hunks are all removed lines, and clicking a deleted file's name does nothing because there is no file to open.
- Double-clicking an added or context line takes the user to that position in the file; removed lines are inert because their positions no longer exist.
- Whole-file changes and changes with more than 400 added and removed lines combined start collapsed without a reason message. The file-view control or a double-click on the header reveals the content.
- A git failure that is not the not-a-repository case shows the failure's reason as one line in the tab body, the way the search tab's body shows a failed scan's reason, and the plugin keeps running.

### Naming and user-visible wording

- The command token is **`diff`**, the tab's title in the strip is **diff**, and the plugin's id and label prefix are `diff`.
- The workspace button's tooltip is **Show diff in the workspace**.
- Whole-file and over-cap entries start collapsed; the rest start expanded. File headers identify status and counts, but show no collapse-reason message.
- Hunk lines **carry their file line numbers**.
- The header carries the diffed root's path and the **Unified / Split** control. The tab refreshes automatically every second; there is no manual refresh control. Whitespace-only changes are always shown.
- Each file entry's header carries its add and delete counts, the way GitHub's files-changed view shows them beside the file's name.

### Added from gap research

Three gaps against the mature products that own this capability were chosen by the user and are part of the feature:

- **A split view.** The change set opens in the unified layout, the way GitHub's files-changed view opens, and a **Unified / Split** control in the header switches to side by side with the old content on one side and the new on the other, the way GitHub's split view, GitHub Desktop, and VS Code's diff editor all do. In the split layout each column carries its own side's line numbers, and an added or deleted file simply has one empty side.
- **Keyboard navigation.** The body is one focusable region and the **down and up arrows walk the changed hunks**, hunk by hunk, across every file entry in file order, stopping at the first and last change and scrolling a file into view as the walk reaches it. Return opens the file at the walked hunk's first changed line, and a click on a hunk selects it and focuses the body so the walk continues from where the mouse left off. This is the difference between this tab and a picture of a diff: every other list in the application is keyboard-navigable, and this one is too.
- **Whitespace changes remain visible.** The final tab has no whitespace filter; whitespace-only edits are included in the change set.

The selected layout is saved through the plugin settings and is restored when another diff tab opens. Full-file expansion, file collapse, comments, drafts, and the keyboard walk belong to the open tab and are discarded when it closes; changing the diff root clears file-specific review state.

## Design decisions established by the feature text and existing behavior

- **It is a plugin.** The tab is a bundled tab plugin in `src/plugins/diff/` and `web/src/plugins/diff/`, added to both loader maps and the catalog. It is not core.
- **It is a tab, not an overlay.** A persistent view tab, matching the other list plugins, not a Quick-Open-style modal.
- **It is read-only.** Nothing in it stages, unstages, discards, or commits, and it writes nothing to the user's git index. The feature text's "used to inspect changes" is the boundary.
- **Opening a file at a line reuses the editor tab's de-duplication.** A file already open in an editor tab is focused rather than duplicated, exactly as every other path into the editor behaves.
- **The tab is live and in-memory** like every other plugin tab: not persisted, not restored on `--relaunch`, and closing it forgets everything it held.
- **The workspace button appears only on a shell or harness tab that has a workspace**, and is inert while that tab's workspace is still provisioning.

## What already exists (reuse, don't rebuild)

| Need | Existing thing | Where |
| --- | --- | --- |
| A command-opened, file-less plugin tab opened and focused through one instance key | The `search` plugin's `SearchSession`: `openOrFocusTab(INSTANCE_KEY, factory)`, `updateTab` to repaint, `dispose` to release | `src/plugins/search/session.ts` |
| Plugin tab shape and registration | Pure `manifest.ts`, import-free `shared.ts`, `activate.ts`, `noFileOpener`, `defineIntents`, catalog plus literal loader entries on both sides | `src/plugins/api.ts`, `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, `web/src/plugins/registry.tsx` |
| Opening a file in an editor tab at a line | The `openInEditor(absPath, line)` server capability, which is `edit <absPath>:<line>` through the ordinary pipeline: de-duplicated tab, line centered, `/open/<id>` allow-list | `src/plugins/api.ts` (`openInEditor`), `src/plugins/context.ts` |
| Running git with `execFile` and tolerating a non-git directory | `changedPaths` / `currentBranch`, which resolve to an empty result rather than rejecting | `src/git/status.ts` |
| A launch-directory bound for plugin-reachable paths | `isInsideRoot`, the same bound `openInEditor` enforces; a workspace clone lives at `<project>/.janissary/workspace/<name>`, inside the launch directory | `src/plugins/files.ts`, `src/workspace/index.ts` |
| Opening a plugin tab beside an existing tab, with the provisioning guard already applied | `PluginManagerHost.openSibling(id, origin)`, which reads the origin tab's `workspaceDir`, returns early while that workspace is provisioning, then calls the activation's `openSibling` hook | `src/plugins/host.ts` |
| A tab-scoped RPC that opens a plugin tab for a shell or harness tab | `launchShellFor { label }`, routed through the controller adapter to `managers.plugins.openSibling('shell', { label, command: 'zsh' })`; the client's mirror is the optional `launchShellHere()` capability | `src/protocol/core-rpc.ts`, `src/controller/file/navigator-adapter.ts`, `web/src/plugins/api.ts` |
| Metadata-row buttons on a shell tab and on a harness tab | `ShellTabMeta` (the shell plugin's own row) and the host's `HarnessTabMeta` with its `harnessTabIntents` | `web/src/plugins/shell/ShellTabMeta.tsx`, `web/src/shared/HarnessTab.tsx`, `web/src/shared/harness-tab-intents.ts` |
| A repeating refresh while a view is open | `setInterval` owned by the playing view's own hook | `src/file-navigator/poll.ts`, `web/src/plugins/asciicast/usePlayback.ts` |
| The added and removed row look | The editor's inline suggest diff colors: green from `--success` and red from `--error`, without crossing out removed text | `web/src/theme.css` (`.editor-diff-add`, `.editor-diff-remove`), `web/src/editor/render.tsx` |
| The keyboard selection rule a plugin list shares | `useListSelection` and `nextListSelection`: the arrows step by one and stop at the ends, Home and End jump to the ends, the selection is clamped into whatever list arrived, and the selected row is scrolled into view | `web/src/shared/list-selection.ts` |
| Testing git behavior against a real repository | `mkdtempSync` plus `git init -b master`, `git config`, `git add`, `git commit` helpers | `src/git/status.test.ts` |
| The spec and help conventions a new tab follows | `product/specs/search-tab.md`, the `search` row in `help.md`'s Commands table | `product/specs/search-tab.md`, `help.md` |

**Not reused, and why.** There is no diff parser anywhere in `src/`, so parsing git's output is new code. `openClaimedFiles` cannot open a media tab for a binary file — it is pinned to the plugin's own claimed extensions, and this plugin claims none — so the binary entry's click dispatches the application's own `open` line through the existing `dispatchLineWithOutput` capability and lets the ordinary opener resolution route the file.

## Implementation decisions

### Root resolution

Three inputs name the root, and each is resolved the same way: to an absolute directory, then checked with `isInsideRoot` against the launch directory. A bare `diff` uses the originating tab's project root from `originTab().root`. A `diff <path>` resolves its argument against that root; a path that escapes it is a `rejectRequest` naming the bound, which surfaces on the originating transcript and leaves the plugin running. The workspace button resolves the tab's workspace directory from the `openSibling` hook's `originTab().workspace?.dir`, and does nothing when the origin tab has no workspace. A root that is not inside a git repository is not an error: the payload's state says so and the body shows the message.

### Reading the change set without touching the index

The tab never mutates the repository. That rules out `git add -N`, the usual way to make untracked files diffable, because it writes to the user's index. Instead the change set is read in one of two ways:

1. **When `HEAD` resolves.** `git diff HEAD -M --no-ext-diff` gives the tracked changes, rename detection included. The untracked files come from `git ls-files --others --exclude-standard`, and each is diffed on its own with `git diff --no-index -- /dev/null <path>`, whose exit code 1 means "the files differ" rather than failure. Whitespace-only changes remain visible.
2. **When `HEAD` does not resolve** — a repository with no commits. Every file gitignore admits, from `git ls-files --exclude-standard` and `git ls-files --others --exclude-standard`, is diffed against `/dev/null` the same way, so a fresh `git init` project reads as all-added rather than as a failure.

Both cases produce the same unified-diff grammar, so one parser serves both. **Deliberate ceiling:** one git process per untracked file. On a workspace whose untracked set is large this is the slow path; the upgrade is a temporary index copy pointed at by `GIT_INDEX_FILE` with intent-to-add applied to the copy, which never touches the user's own index. Nothing in the plan blocks it.

### Parsing the diff

A pure module turns git's output into the payload's records. One record per changed file carries the file's project-relative path, its old path when git reports a rename, whether it is deleted, whether it is binary, and its hunks. One hunk carries its old and new start lines and counts from the `@@` header and its lines, each marked added, removed, or context. Three details are pinned so the parser is not ambiguous: a `--- /dev/null` or `+++ /dev/null` side marks a file as added or deleted; a `Binary files … differ` line produces a binary record with no hunks; and a `\ No newline at end of file` marker belongs to the line before it and is not a line of its own.

### Line positions

A line's position in the file is the hunk's new-side start line plus the count of added and context lines before it in that hunk. Removed lines are inert on double-click. For keyboard Return on a deletion-only hunk, the parser assigns a valid existing new-side line: the nearest added or context line when present, otherwise the previous line, clamped to line one. The client does not compute any of this: each line's payload record carries the number to send.

### The singleton and re-scoping

A `DiffSession` beside `activate.ts` holds the tab's current root and payload, the same shape `SearchSession` uses for its query and rows. Opening goes through `openOrFocusTab` with one instance key, so a second route focuses the open tab; the factory runs only when the tab must be built. Re-scoping an already-open tab does not go through the factory: the session records the new root and repaints through `updateTab`, so one open tab re-scopes in place.

### The automatic refresh

The client polls a recompute intent every second while the diff tab is mounted — the tab is in-memory only, so unmounting means the tab closed, and the poll stops with it. There is no manual refresh button. On the server one tracked diff read and bounded batches of untracked-file reads build the change set, and a recompute already in flight for the same root is not started again, so a slow diff cannot queue up behind itself.

### The workspace button

The button is tab-scoped, so it is an RPC rather than a dispatched command, for the reason `launchShellHere` gives: a command run in the tab would diff whatever the tab's command line resolves, not the tab's own environment. A new `openDiffFor { label }` core RPC mirrors `launchShellFor` end to end — the protocol entry, the `ack` reply kind, the client-params validator, the message routing, and a controller-adapter method that calls `managers.plugins.openSibling('diff', { label, command: 'diff' })`. The host's `openSibling` already reads the origin tab's workspace directory and already returns early while that workspace is provisioning, which is the inert-while-provisioning behavior the button needs. On the client, a new optional `openDiffHere?()` capability mirrors `launchShellHere`; `ShellTabMeta` draws the button when its payload says the tab has a workspace, and the host's `HarnessTabMeta` draws the same button through `harnessTabIntents`.

### The binary entry's media link

The `open` intent serves both kinds of jump: it names a file's project-relative path and a line, the session resolves the path against the tab's current root and checks it with `isInsideRoot` first — exactly as `SearchSession.openMatch` does, so a client naming a path the diff never produced gets nothing — and the handler then calls `openInEditor` with the file's absolute path and the line's position in the file. A binary entry's click instead dispatches the application's own `open` line for that path through `dispatchLineWithOutput`. The ordinary opener resolution then routes the file by extension to the image, video, audio, or pdf plugin tab, exactly as `open <file>` does, so this plugin holds no second routing table and a new media type needs no change here.

### Header and body states

The header is the plugin's own `plugin-meta` row, matching the other plugins. It carries the diffed root's path and the **Unified / Split** control beside the host's Split control. The body carries the file list, **No changes**, **This directory is not a git repository**, or a failure's reason as one line. It has no navigation-instructions hover tooltip.

**Split view is client rendering**: the payload carries the hunks, and the client lays the same lines out in one column or two. Whitespace filtering is not part of the feature; all git-reported whitespace changes remain visible.

The selected layout is persisted through `readSettings` and `saveSettings`. The root, full-file expansion, file collapse state, comments, and walk position remain transient. Whole-file and over-400-change entries start collapsed without a count or reason message; other files start with the compact diff visible.

### What is server state and what is not

Git content and full-file context arrive in the server payload. Layout preference is persisted by the server plugin settings; file collapse, line comments and drafts, scroll position, and walked hunk are client-local. Refresh preserves the current body until replacement data arrives.

The file-view button cycles a file through closed, compact diff, and full-file views. The keyboard walk uses up and down for hunks, `j` and `k` for files, Left to collapse the selected file, and Right to cycle its view. A selected hunk keeps its file's accent left border visible while that file is collapsed. Double-clicking the header toggles the file between its collapsed and visible states. The body has no navigation-instructions tooltip.

Character-level marks appear only for paired removed/added lines whose longest common subsequence shares at least half of the shorter line and includes an unchanged run at least 70% as long as that line. Replacements without that shared structure keep their line-level added and removed colors only; lines over 400 characters are not aligned.

## Proposed changes

### New plugin `diff`

Server tree, no barrel file:

- `src/plugins/diff/manifest.ts` — `id: 'diff'`, `version: '1.0.0'`, `apiVersion: TAB_PLUGIN_API_VERSION` (unchanged at 2), `payloadSchemaVersion` from `shared.ts`, `tabLabelPrefix: 'diff'`, `fileExtensions: {}`, `command: 'diff'`, and exactly the capabilities it uses: `openOrFocusTab`, `updateTab`, `openInEditor`, `originTab`, `dispatchLineWithOutput`, `rejectRequest`, `reportFailure`. Pure data. The `diff` claim is free: there is no core `diff` command in the registry, `diff` is not in `ROUTE_NAMES` (`['shell']`), and it is not in `RESERVED_NON_COMMAND_NAMES` (`['help']`), so `createPluginCommands` refuses nothing here.
- `src/plugins/diff/shared.ts` — schema version 7, payload and intent types, and hand-written import-free guards. File records include status, both line-number sides, full-file context metadata and hunks; intents cover refresh, layout, opening lines/media, and full-file context requests.
- `src/plugins/diff/parse-diff.ts` — the pure part: git's diff output and a file's relative path in, file records out, including the binary, rename, add, and delete markers and the newline-at-eof marker. A removed line carries a safe new-side line number used when Return opens a deletion-only hunk; removed lines themselves are inert on double-click. A record whose path the caller supplies omits an absent `oldPath` key rather than carrying it as `undefined`, because the host refuses a published payload with a property whose value is `undefined`.
- `src/plugins/diff/change-set.ts` — the effectful change reader: resolve `HEAD`, read tracked and untracked changes, and return file records or a reason. It includes mode-only and binary changes and handles repositories without commits; it does not modify the index.
- `src/plugins/diff/session.ts` — the `DiffSession`: root and payload, singleton open and re-scope, refresh coordination, persisted layout setting, per-file full-file expansion, and disposal. Refresh retains the previous content while reading; root changes discard old-root results and transient file review state.
- `src/plugins/diff/activate.ts` — activation, command and workspace routes, plus guarded refresh, layout, line/media opening, and full-file context intents. Refresh answers with a JSON-compatible result and runs recomputation outside the guarded intent. A path outside the launch root is rejected; a valid directory outside a repository is shown as a recoverable tab state.

### The `openDiffFor` route

- `src/protocol/core-rpc.ts` — `{ method: 'openDiffFor'; params: { label: string } }` beside `launchShellFor`.
- `src/client-message.ts` — the `openDiffFor: 'ack'` reply kind.
- `src/client-params/core.ts` and its test — `openDiffFor: (p) => isString(p.label)`.
- `src/message/tabs.ts` and `src/message/handler.ts` — the routing case, beside `launchShellFor`.
- `src/controller/file/navigator-adapter.ts` — `openDiffFor(label)`, calling `managers.plugins.openSibling('diff', { label, command: 'diff' })`, the same one-liner `launchShellFor` uses.

This is a core RPC, not a plugin-API change: `TAB_PLUGIN_API_VERSION` stays 2, because no capability, hook, or declaration field moves.

### Client tree, one component per file

- `web/src/plugins/diff/index.tsx` — default-exports the component, named-exports the payload guard.
- `web/src/plugins/diff/DiffTab.tsx` — root and persisted layout controls, automatic refresh, file list, keyboard walk and disclosure, and states; there is no navigation tooltip or manual refresh button.
- `web/src/plugins/diff/useDiffRefresh.ts` — the one-second refresh interval while mounted.
- `web/src/plugins/diff/FileEntry.tsx` — status and count header, per-file collapse, whole-file and over-400-line initial collapse without a message, the closed/compact/full-file cycle, and hunks. A collapsed entry with the selected hunk keeps its accent border. Deleted files are inert; binary entries dispatch ordinary file opening.
- `web/src/plugins/diff/HunkLines.tsx` — unified lines in git order, with shared syntax highlighting, side-specific gutters, qualified intraline changes and local comment controls.
- `web/src/plugins/diff/SplitHunks.tsx` — the same hunk in the split layout: the old side's removed and context lines beside the new side's added and context lines, aligned so a replaced pair sits on one row, each column carrying its own side's line numbers. It renders one hunk's payload, not a second payload.
- `web/src/plugins/diff/useHunkWalk.ts` — the keyboard walk, composed on the host's `useListSelection` rather than a second arrow-key rule of its own: the hook is handed the flattened hunk list's length, and the walk's stopping at the first and last change, its clamping into a list that just changed, and its scroll-into-view are that hook's behavior. What is left here is the Return handler that opens the file at the walked hunk's first changed line, and nothing else.
- `web/src/plugins/diff/hunk-index.ts` — the pure part of the walk: the change set's hunks as one ordered list in file order, the offset a file entry's hunks start at, and the lookup from a walked index back to its file entry, its hunk, and the line Return opens at. Pure, so the walk's order and its coordinates are testable without a render.
- `web/src/plugins/diff/diff.css` — diff rows, split alignment, review controls, hover treatment, and editor-matched typography and colors.

Registration: a catalog entry in `src/plugins/catalog.ts`, a literal dynamic import in `src/plugins/loaders.ts`, and one in `web/src/plugins/registry.tsx` with the schema version as a literal.

Every existing file the change touches has room for its one or two added lines, and the new plugin files are split one-concern-per-file precisely so none approaches the 200-line limit: `web/src/plugins/api.ts` is at 167 counted lines of 200, the RPC and message files are all under 150, and the two metadata-row components are at 115 and 146. A new file that grows past the limit is extracted per `ai/guidelines/code-guidelines.md`, never compacted.

The shell and harness buttons: `ShellTabMeta` gains the button beside the file-navigator button, drawn when its payload says the tab has a workspace and its shell is local — a remote tab's workspace lives on the far side, where this application has no git to read — and calling `capabilities.openDiffHere?.()`; `HarnessTabMeta` gains the same button through a new `onOpenDiffHere` intent in `harnessTabIntents`, drawn for a workspaced local tab; `web/src/plugins/api.ts` supplies `openDiffHere` beside `launchShellHere`.

### Specs, help, and documentation

- `product/specs/diff-tab.md` — a new spec in the shape of `product/specs/search-tab.md`: opening routes, the change set, updating, the edge states, navigation, and lifetime. User-visible behavior only, no implementation.
- `product/specs/tab-plugins.md` — a **Bundled diff plugin** section beside the other bundled plugins, and a line in the **API version 2** section for the new `openDiffHere()` client capability, which is additive and leaves the version integer at 2.
- `help.md` — a `diff` row in the Commands table beside `search`, one line.
- `product/specs/tabs.md` — the metadata row's diff button, one paragraph beside the new-shell button's.

### Ordering the implementation so the tree stays green

1. `shared.ts` and its guards.
2. `parse-diff.ts` and its tests, the pure half.
3. `change-set.ts` and its tests against a temporary repository.
4. `session.ts` and `activate.ts`, then the catalog and both loader entries.
5. The `openDiffFor` route: protocol, reply kind, params, routing, adapter, with their tests.
6. The two metadata buttons and the `openDiffHere` capability.
7. The client tree, then `web/src/plugins/registry.tsx`.
8. The spec and `help.md` last, once the behavior exists to describe.

## Tests

- `src/plugins/diff/parse-diff.test.ts` — modified, added, deleted, renamed, and binary files; a hunk at the start and at the end of a file; the no-newline-at-eof marker; a rename with its old and new paths; a mode-only change, which git names only on its `diff --git` line; the line-position arithmetic for added, removed, and context lines, including a removed line that borrows the next line, one that borrows the previous line when the hunk ends in removals, and a hunk of nothing but removals answering the line above it clamped to 1; and a record the caller named carrying no `oldPath` key at all.
- `src/plugins/diff/context-diff.test.ts` — full-file context expansion, path handling, recoverable failures, and payload/context-intent guards; incremental and omitted-boundary context intents are not present.
- `src/plugins/diff/change-set.test.ts` — modified, staged, untracked, deleted, renamed, binary and mode-only entries; whitespace-only edits; non-repository directories; and repositories without commits.
- `src/plugins/diff/activate.test.ts` and `src/plugins/diff/session-context.test.ts` — command opening and focusing, path validation, workspace scoping, guarded intents, JSON-compatible payloads with untracked files, in-flight refresh and full-file requests, stale-root reads, and disposal.
- `src/client-params/core.test.ts`, `src/message/handler.test.ts`, and `src/controller/file/navigator-adapter.test.ts` — the `openDiffFor` route beside the `launchShellFor` cases they already carry.
- `web/src/plugins/diff/DiffTab.test.tsx` and colocated tests — lazy loading and schema parity; both layouts, syntax and intraline highlighting (including unrelated replacement suppression and parameter-name changes), file status, collapse behavior, Left/Right disclosure, `j`/`k` and hunk navigation, selected collapsed-file border, absence of the navigation tooltip and manual refresh button, hover, line comments, full-file controls, periodic refresh, no-change/error states, and line/media opening.
- `web/src/plugins/diff/hunk-index.test.ts` — the flattened order across file entries, the line a Return opens at for a hunk that adds and for one that only removes, and the offsets a file entry's hunks start at.
- `web/src/plugins/diff/split-rows.test.ts` — a context line on both sides, a removed run paired with the added run that follows it, a side left empty when the runs differ in length, and two separate replace runs on their own rows.
- `web/src/plugins/registry.test.tsx` — the new entry's schema literal and catalog parity.
- `web/src/shared/syntax-highlight/code-operators.test.ts`, `file-tokenize.test.ts`, `registry.test.ts`, `themes.test.ts`, and `tokenize.test.ts` — shared editor/diff language registration, file-based language selection, token ranges, operator scopes, and theme CSS.
- `web/src/plugins/api.test.ts` — the `openDiffHere` capability sending `openDiffFor`.
- `web/src/plugins/shell/ShellTabMeta.test.tsx` and `web/src/shared/HarnessTabMeta.test.tsx` — the button on a workspaced tab, and its absence on one without a workspace.

## Out of scope

- Any action that modifies the change set: staging, unstaging, discarding, or committing.
- Any write to the user's git index, including intent-to-add.
- Comparing against anything other than the working tree and `HEAD`: no branch, tag, or commit refs.
- A staged/unstaged split, offered during planning and declined: the change set is always all changes versus `HEAD` in one list.
- Sending comments to a remote service or writing them to source files; comments are local and temporary.
- Editing the file's content from the diff tab; every write stays inside the editor tab.
- Docking the diff tab into a sidebar: it is a full-width view and `dockTab` is not among the capabilities it declares.
- Persisting the tab contents across a restart; only the selected layout preference is saved.
- Recovering a tab whose payload the host refused: the host has already closed it, and a plugin-shaped payload should satisfy the host's check rather than argue with it.

### Gaps researched and declined

These were raised against the plan during gap research, and the user declined each. They are recorded here so that no later phase proposes them again as though they were new.

- **Wider context and whole-file views.** The finished behavior uses the header's file-view control to move between collapsed, compact, and full-file views for eligible tracked text files. Incremental and omitted-boundary expansion controls are not part of the plugin; full-file context remains within the diff and preserves file counts.
- **Viewed state per file with a progress tally.** GitHub marks a file Viewed, collapses it, and unmarks it when the file changes again. Declined for this version: the tracking is review state the tab does not own, and the tab recomputes continuously enough that a viewed mark would fight the live update.
- **Filtering the file list.** No file-list filter is present. Large changes instead start collapsed above the documented threshold.
- **A total change summary.** GitHub Desktop heads its list with "3 changed files" plus counts. Declined: the per-file counts already say it, and the search tab's precedent is a header that carries no tally.
- **A rich diff for markdown and manifest files.** GitHub renders a preview beside the source. Declined: the markdown tab and the editor tab already own those views, and a two-pane preview duplicates both.
- **An image diff with 2-up, swipe, or onion skin.** GitHub compares changed images in place. Declined: the binary entry's media link already reaches the file in its own tab, and a comparison overlay is its own feature.
- **Copying a file's path to the clipboard.** lazygit's `y` copies the selected path. Declined: the editor tab already owns copy-path, and the file is one click away in it.

## Verification

`$janissary/scripts/run.mjs check-diff` after each change, a production `npm run build` in `web/` with the diff plugin's modules confirmed in their own chunk and absent from the entry bundle, and a live run in a browser: the tab was driven end to end against a repository holding a rename, a deletion, a staged change, an unstaged change, an untracked file, and a binary file, covering the twelve manual steps above, the five additional cases in the pull request description's **Additional test cases** section — a rename's one entry naming both paths, a staged and an unstaged change in one list, an untracked file as all-added, the command typed in a shell tab, and the tab surviving its refresh loop with `plugins` reporting it active — and the two that could not run in that environment, both of which need a workspaced shell tab. That run is what found the untracked-file crash, which is why the fix and its tests are part of this change.
