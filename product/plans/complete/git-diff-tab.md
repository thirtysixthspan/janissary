# git diff tab

**Complexity: 7/10** — a new bundled plugin spanning both trees with a new core RPC, a new optional client capability, and two new metadata-row buttons; the diff parsing and the untracked-file handling are the real work, and no new plugin-API capability and no new wire type are needed, because the payload rides the existing plugin tab envelope and the intents ride `pluginIntent`.

A **diff tab** inspects the changes in the workspace as a tab instead of as terminal output. It renders those changes the way GitHub renders the files-changed view of a pull request: one entry per changed file, showing the file's name and the shape of its change, and beneath it the diff hunks with added and removed lines distinguished. Clicking a file's entry opens that file in an editor tab. Double-clicking a line inside the diff takes the user to that position in the changed file, in an editor tab.

Today the only way to inspect what changed in a workspace is to type `git diff` into a shell tab and read the wall of unified-diff text it prints, with no path-to-line affordance: nothing in that output is clickable, and reaching the line a hunk concerns means re-finding it by hand in the editor. With agents editing files on the user's behalf, "what just changed, and where" is a question the app is asked constantly, and it currently leaves the app to answer.

## Product decisions

Each of the following was answered by the user during planning and is binding on the implementation.

### Opening routes

Two routes open the tab. A **`diff` command** typed in any tab's command bar opens or focuses the tab, scoped to a directory: run bare it diffs the project's launch directory, and given a path argument it diffs that subtree. A **metadata-row button** on shell and harness tabs that have a workspace opens the tab scoped to that tab's own workspace directory, which is the environment the tab is working in.

### The change set

All changes versus `HEAD` — staged and unstaged shown together, including untracked files as all-added entries, the way GitHub's files-changed view shows every change in a pull request. A binary file is one entry naming it as binary, with no hunks, and that entry opens the media tab the file's extension already opens — image, video, audio, or pdf — rather than an editor tab.

### Updating

Both routes into a fresh diff: the tab recomputes when files change on disk, so the visualization updates dynamically as changes happen, and a refresh button in the header recomputes on demand. Re-running the command recomputes as well.

### One tab at a time

The tab is a singleton. A second route — a different path argument, or another workspace tab's button — re-scopes the open tab to the new root and repaints it in place rather than opening a second diff tab.

### Edge states

- A directory outside a git repository shows **This directory is not a git repository** in the tab body.
- A directory with no changes shows **No changes**.
- A renamed file is one entry carrying its old and new path with only its changed hunks; a deleted file is an entry whose hunks are all removed lines, and clicking a deleted file's name does nothing because there is no file to open.
- Double-clicking any line in a hunk — added, removed, or context — takes the user to that position in the file.
- There is no size cap: every changed file and every hunk is shown, whatever the size of the change.
- A git failure that is not the not-a-repository case shows the failure's reason as one line in the tab body, the way the search tab's body shows a failed scan's reason, and the plugin keeps running.

### Naming and user-visible wording

- The command token is **`diff`**, the tab's title in the strip is **diff**, and the plugin's id and label prefix are `diff`.
- The workspace button's tooltip is **Show diff in the workspace**.
- File entries are **all expanded** when the diff loads — no collapsed summaries.
- Hunk lines **carry their file line numbers**.
- The header carries the diffed root's path, the **Unified / Split** control, the **Hide whitespace changes** toggle, and a **refresh button**.
- Each file entry's header carries its add and delete counts, the way GitHub's files-changed view shows them beside the file's name.

### Added from gap research

Three gaps against the mature products that own this capability were chosen by the user and are part of the feature:

- **A split view.** The change set opens in the unified layout, the way GitHub's files-changed view opens, and a **Unified / Split** control in the header switches to side by side with the old content on one side and the new on the other, the way GitHub's split view, GitHub Desktop, and VS Code's diff editor all do. In the split layout each column carries its own side's line numbers, and an added or deleted file simply has one empty side.
- **Keyboard navigation.** The body is one focusable region and the **down and up arrows walk the changed hunks**, hunk by hunk, across every file entry in file order, stopping at the first and last change and scrolling a file into view as the walk reaches it. Return opens the file at the walked hunk's first changed line, and a click on a hunk selects it and focuses the body so the walk continues from where the mouse left off. This is the difference between this tab and a picture of a diff: every other list in the application is keyboard-navigable, and this one is too.
- **Hiding whitespace changes.** A **Hide whitespace changes** toggle, **on by default**, drops whitespace-only differences through git's own `-w`, the way GitHub's and GitHub Desktop's hide-whitespace options do, so a formatter's reindent does not bury a real change. A file whose changes are all whitespace then has no hunks and leaves the list, and a repository whose only changes are whitespace shows **No changes**.

The two toggles are **per-tab state for this session**: nothing is written to `.janissary/config.json`, and a tab opened after the previous one closed starts again unified with whitespace hidden. The search tab persists its toggles because matching modes are a standing preference; these two are how a diff is being read right now, so they travel with the tab and no further.

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
| The added and removed row look | The editor's inline suggest diff: green from `--success` and red from `--error`, red struck through | `web/src/theme.css` (`.editor-diff-add`, `.editor-diff-remove`), `web/src/editor/render.tsx` |
| The keyboard selection rule a plugin list shares | `useListSelection` and `nextListSelection`: the arrows step by one and stop at the ends, Home and End jump to the ends, the selection is clamped into whatever list arrived, and the selected row is scrolled into view | `web/src/shared/list-selection.ts` |
| Testing git behavior against a real repository | `mkdtempSync` plus `git init -b master`, `git config`, `git add`, `git commit` helpers | `src/git/status.test.ts` |
| The spec and help conventions a new tab follows | `product/specs/search-tab.md`, the `search` row in `help.md`'s Commands table | `product/specs/search-tab.md`, `help.md` |

**Not reused, and why.** There is no diff parser anywhere in `src/`, so parsing git's output is new code. `openClaimedFiles` cannot open a media tab for a binary file — it is pinned to the plugin's own claimed extensions, and this plugin claims none — so the binary entry's click dispatches the application's own `open` line through the existing `dispatchLineWithOutput` capability and lets the ordinary opener resolution route the file.

## Implementation decisions

### Root resolution

Three inputs name the root, and each is resolved the same way: to an absolute directory, then checked with `isInsideRoot` against the launch directory. A bare `diff` uses the originating tab's project root from `originTab().root`. A `diff <path>` resolves its argument against that root; a path that escapes it is a `rejectRequest` naming the bound, which surfaces on the originating transcript and leaves the plugin running. The workspace button resolves the tab's workspace directory from the `openSibling` hook's `originTab().workspace?.dir`, and does nothing when the origin tab has no workspace. A root that is not inside a git repository is not an error: the payload's state says so and the body shows the message.

### Reading the change set without touching the index

The tab never mutates the repository. That rules out `git add -N`, the usual way to make untracked files diffable, because it writes to the user's index. Instead the change set is read in one of two ways:

1. **When `HEAD` resolves.** `git diff HEAD -M --no-ext-diff -w` gives the tracked changes, rename detection included, with `-w` present exactly when the hide-whitespace toggle is on. The untracked files come from `git ls-files --others --exclude-standard`, and each is diffed on its own with `git diff --no-index -- /dev/null <path>`, whose exit code 1 means "the files differ" rather than failure; `-w` is passed there too when the toggle is on.
2. **When `HEAD` does not resolve** — a repository with no commits. Every file gitignore admits, from `git ls-files --exclude-standard` and `git ls-files --others --exclude-standard`, is diffed against `/dev/null` the same way, so a fresh `git init` project reads as all-added rather than as a failure.

Both cases produce the same unified-diff grammar, so one parser serves both. **Deliberate ceiling:** one git process per untracked file. On a workspace whose untracked set is large this is the slow path; the upgrade is a temporary index copy pointed at by `GIT_INDEX_FILE` with intent-to-add applied to the copy, which never touches the user's own index. Nothing in the plan blocks it.

### Parsing the diff

A pure module turns git's output into the payload's records. One record per changed file carries the file's project-relative path, its old path when git reports a rename, whether it is deleted, whether it is binary, and its hunks. One hunk carries its old and new start lines and counts from the `@@` header and its lines, each marked added, removed, or context. Three details are pinned so the parser is not ambiguous: a `--- /dev/null` or `+++ /dev/null` side marks a file as added or deleted; a `Binary files … differ` line produces a binary record with no hunks; and a `\ No newline at end of file` marker belongs to the line before it and is not a line of its own.

### Line positions

A line's position in the file is the hunk's new-side start line plus the count of added and context lines before it in that hunk. A removed line has no new-side position, so a double-click on one uses the position of the nearest added or context line at or after it. The client does not compute any of this: each line's payload record carries the number to send.

### The singleton and re-scoping

A `DiffSession` beside `activate.ts` holds the tab's current root and payload, the same shape `SearchSession` uses for its query and rows. Opening goes through `openOrFocusTab` with one instance key, so a second route focuses the open tab; the factory runs only when the tab must be built. Re-scoping an already-open tab does not go through the factory: the session records the new root and repaints through `updateTab`, so one open tab re-scopes in place.

### The automatic refresh

The client polls a recompute intent on an interval while the diff tab is mounted — the tab is in-memory only, so unmounting means the tab closed, and the poll stops with it. The header's refresh button calls the same intent directly. On the server the recompute is one git run per file under the tab's root, and a recompute already in flight for the same root is not started again, so a slow diff cannot queue up behind itself.

### The workspace button

The button is tab-scoped, so it is an RPC rather than a dispatched command, for the reason `launchShellHere` gives: a command run in the tab would diff whatever the tab's command line resolves, not the tab's own environment. A new `openDiffFor { label }` core RPC mirrors `launchShellFor` end to end — the protocol entry, the `ack` reply kind, the client-params validator, the message routing, and a controller-adapter method that calls `managers.plugins.openSibling('diff', { label, command: 'diff' })`. The host's `openSibling` already reads the origin tab's workspace directory and already returns early while that workspace is provisioning, which is the inert-while-provisioning behavior the button needs. On the client, a new optional `openDiffHere?()` capability mirrors `launchShellHere`; `ShellTabMeta` draws the button when its payload says the tab has a workspace, and the host's `HarnessTabMeta` draws the same button through `harnessTabIntents`.

### The binary entry's media link

The `open` intent serves both kinds of jump: it names a file's project-relative path and a line, the session resolves the path against the tab's current root and checks it with `isInsideRoot` first — exactly as `SearchSession.openMatch` does, so a client naming a path the diff never produced gets nothing — and the handler then calls `openInEditor` with the file's absolute path and the line's position in the file. A binary entry's click instead dispatches the application's own `open` line for that path through `dispatchLineWithOutput`. The ordinary opener resolution then routes the file by extension to the image, video, audio, or pdf plugin tab, exactly as `open <file>` does, so this plugin holds no second routing table and a new media type needs no change here.

### Header and body states

The header is the plugin's own `plugin-meta` row, matching the other plugins. It carries the diffed root's path, the **Unified / Split** control, the **Hide whitespace changes** toggle, and the refresh button at its right edge beside the host's Split control. The body carries the four states: the file list, **No changes**, **This directory is not a git repository**, and a failure's reason as one line.

The two toggles are client-local view state in one respect and server-carried in another, and the split matters. **Split view is purely client rendering**: the payload carries the hunks, and the client lays the same lines out in one column or two. **Hide whitespace changes is not**: it changes which lines git reports, so the current toggle state travels in every recompute intent exactly as the search tab's three mode flags travel in its search intent, and the server holds no toggle state between calls. A toggle change therefore re-runs the recompute immediately, the way editing the search tab's include field does.

Nothing is remembered. The search tab persists its three toggles because a user's preferred matching modes outlive a session; the diff tab has no setting to remember — its root always starts at the project root, its entries are always expanded, and its two view toggles live and die with the tab — so it declares neither `readSettings` nor `saveSettings`.

### What is server state and what is not

Every piece of diff content — the root, the files, the hunks, the lines, the states — is server state in the payload, because the client must not recompute anything the server already knows. Client-local state is only what is ephemeral and view-local: the scroll position and the walked hunk index, which `useListSelection` owns and which a recompute that changes the list re-clamps rather than preservingly names the same hunk. File entries have no collapsed state to remember, because they are all expanded.

## Proposed changes

### New plugin `diff`

Server tree, no barrel file:

- `src/plugins/diff/manifest.ts` — `id: 'diff'`, `version: '1.0.0'`, `apiVersion: TAB_PLUGIN_API_VERSION` (unchanged at 2), `payloadSchemaVersion` from `shared.ts`, `tabLabelPrefix: 'diff'`, `fileExtensions: {}`, `command: 'diff'`, and exactly the capabilities it uses: `openOrFocusTab`, `updateTab`, `openInEditor`, `originTab`, `dispatchLineWithOutput`, `rejectRequest`, `reportFailure`. Pure data. The `diff` claim is free: there is no core `diff` command in the registry, `diff` is not in `ROUTE_NAMES` (`['shell']`), and it is not in `RESERVED_NON_COMMAND_NAMES` (`['help']`), so `createPluginCommands` refuses nothing here.
- `src/plugins/diff/shared.ts` — `DIFF_PAYLOAD_SCHEMA_VERSION`, the payload type, the intent payload types, and hand-written import-free guards. The payload carries the diffed root, the state (`loading`, `done`, or `error`), the state message when it is an error, and the file records. Guards reject arrays and `null` where an object is required and validate every field.
- `src/plugins/diff/parse-diff.ts` — the pure part: git's diff output and a file's relative path in, file records out, including the binary, rename, add, and delete markers and the newline-at-eof marker.
- `src/plugins/diff/change-set.ts` — the effectful part: resolve `HEAD`, run `git diff HEAD -M --no-ext-diff`, enumerate the untracked files, run one `git diff --no-index` per untracked file, and return the file records or a reason. Resolves to a not-a-repository state rather than throwing, the way `changedPaths` does.
- `src/plugins/diff/session.ts` — the `DiffSession`: the tab's current root and payload, open and re-scope through `openOrFocusTab` and `updateTab`, the recompute in flight per root, and `dispose`.
- `src/plugins/diff/activate.ts` — `activate()` returning `isPayload`, `opener: noFileOpener('diff')`, the `command` that resolves a root and opens or re-scopes the tab, the `openSibling` hook that scopes the tab to the origin tab's workspace, and `intent` via `defineIntents` for `refresh` (recompute, carrying the hide-whitespace flag so the git invocation matches what the user is reading), `open` (open a file at a line in an editor tab), and `open-media` (dispatch the application's `open` line for a binary file).

### The `openDiffFor` route

- `src/protocol/core-rpc.ts` — `{ method: 'openDiffFor'; params: { label: string } }` beside `launchShellFor`.
- `src/client-message.ts` — the `openDiffFor: 'ack'` reply kind.
- `src/client-params/core.ts` and its test — `openDiffFor: (p) => isString(p.label)`.
- `src/message/tabs.ts` and `src/message/handler.ts` — the routing case, beside `launchShellFor`.
- `src/controller/file/navigator-adapter.ts` — `openDiffFor(label)`, calling `managers.plugins.openSibling('diff', { label, command: 'diff' })`, the same one-liner `launchShellFor` uses.

This is a core RPC, not a plugin-API change: `TAB_PLUGIN_API_VERSION` stays 2, because no capability, hook, or declaration field moves.

### Client tree, one component per file

- `web/src/plugins/diff/index.tsx` — default-exports the component, named-exports the payload guard.
- `web/src/plugins/diff/DiffTab.tsx` — the tab: the metadata header with the root, the two toggles and the refresh button, and the file list. It holds no state beyond what it renders.
- `web/src/plugins/diff/useDiffRefresh.ts` — the tab's one hook: an interval that recomputes the diff while the tab is mounted, plus the refresh button's direct call, both sending the same intent with the current toggle state. The tab is in-memory only, so unmounting stops the poll with it.
- `web/src/plugins/diff/FileEntry.tsx` — one file's header with its path, its rename, and its add and delete counts, plus the entry's hunks.
- `web/src/plugins/diff/HunkLines.tsx` — one hunk's lines in the unified layout: file line numbers, GitHub-style added and removed coloring, and the double-click that emits the open intent for the line under the pointer.
- `web/src/plugins/diff/SplitHunks.tsx` — the same hunk in the split layout: the old side's removed and context lines beside the new side's added and context lines, aligned so a replaced pair sits on one row, each column carrying its own side's line numbers. It renders one hunk's payload, not a second payload.
- `web/src/plugins/diff/useHunkWalk.ts` — the keyboard walk, composed on the host's `useListSelection` rather than a second arrow-key rule of its own: the hook is handed the flattened hunk list's length, and the walk's stopping at the first and last change, its clamping into a list that just changed, and its scroll-into-view are that hook's behavior. What is left here is the Return handler that opens the file at the walked hunk's first changed line, and nothing else.
- `web/src/plugins/diff/hunk-index.ts` — the pure part of the walk: the change set's hunks as one ordered list in file order, the offset a file entry's hunks start at, and the lookup from a walked index back to its file entry, its hunk, and the line Return opens at. Pure, so the walk's order and its coordinates are testable without a render.
- `web/src/plugins/diff/diff.css` — the plugin's own look, in its own file as the other plugins do, following the editor's green-from-`--success` and red-from-`--error` convention rather than inventing a second one.

Registration: a catalog entry in `src/plugins/catalog.ts`, a literal dynamic import in `src/plugins/loaders.ts`, and one in `web/src/plugins/registry.tsx` with the schema version as a literal.

Every existing file the change touches has room for its one or two added lines, and the new plugin files are split one-concern-per-file precisely so none approaches the 200-line limit: `web/src/plugins/api.ts` is at 167 counted lines of 200, the RPC and message files are all under 150, and the two metadata-row components are at 115 and 146. A new file that grows past the limit is extracted per `ai/guidelines/code-guidelines.md`, never compacted.

The shell and harness buttons: `ShellTabMeta` gains the button beside the file-navigator button, drawn when its payload says the tab has a workspace and its shell is local — a remote tab's workspace lives on the far side, where this application has no git to read — and calling `capabilities.openDiffHere?.()`; `HarnessTabMeta` gains the same button through a new `onOpenDiffHere` intent in `harnessTabIntents`, drawn for a workspaced local tab; `web/src/plugins/api.ts` supplies `openDiffHere` beside `launchShellHere`.

### Specs, help, and documentation

- `product/specs/diff-tab.md` — a new spec in the shape of `product/specs/search-tab.md`: opening routes, the change set, updating, the edge states, navigation, and lifetime. User-visible behavior only, no implementation.
- `product/specs/tab-plugins.md` — a **Bundled diff plugin** section beside the other bundled plugins, and a line in the **API version 2** section for the new `openDiffHere()` client capability, which is additive and leaves the version integer at 2.
- `help.md` — a `diff` row in the Commands table beside `search`, one line.
- `product/specs/tabs.md` is not touched: the tab follows the plugin-tab lifetime every plugin tab follows, which `product/specs/tab-plugins.md` already describes as the contract rather than as one plugin's behavior.

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

- `src/plugins/diff/shared.test.ts` — every guard accepts a well-formed value and rejects a malformed one, arrays and `null` included.
- `src/plugins/diff/parse-diff.test.ts` — modified, added, deleted, renamed, and binary files; a hunk at the start and at the end of a file; the no-newline-at-eof marker; a rename with its old and new paths; and the line-position arithmetic for added, removed, and context lines.
- `src/plugins/diff/change-set.test.ts` — against a temporary repository built the way `src/git/status.test.ts` builds one: modified, staged, and untracked files all appearing; a deleted file; a renamed file; a binary file; a directory outside a repository resolving to the not-a-repository state rather than throwing; a repository with no commits reading as all-added; a whitespace-only change disappearing when the hide-whitespace flag is set and appearing when it is not; and the flag reaching the untracked path too.
- `src/plugins/diff/activate.test.ts` — the command opening and focusing, a path argument resolving against the origin tab's root, a path escaping the root being rejected, `openSibling` scoping to the origin tab's workspace, each intent accepting and rejecting as declared, a re-scope repainting the open tab rather than opening a second one, and `dispose` releasing.
- `src/client-params/core.test.ts` and `src/message/handler.test.ts` and `src/controller/file/navigator-adapter.test.ts` — the `openDiffFor` route beside the `launchShellFor` cases they already carry.
- `web/src/plugins/diff/DiffTab.test.tsx` — lazy loading through the registry, payload validation, hunks rendering with added and removed coloring and their line numbers, the add and delete counts, the `No changes` and not-a-repository states, the error line, the refresh button emitting the intent and the interval emitting it, a file click and a line double-click emitting the open intent, a binary entry emitting the media intent, the **Unified / Split** control switching the layout (the split layout showing each side's own line numbers and an added file's empty old side), the **Hide whitespace changes** toggle defaulting to on and emitting a recompute when changed, and the keyboard walk — the arrows crossing file entries, stopping at the last change, scrolling the walked hunk into view, and Return opening at its first changed line.
- `web/src/plugins/diff/hunk-index.test.ts` — the flattened order across file entries, the line a Return opens at for a hunk that adds and for one that only removes, and the offsets a file entry's hunks start at.
- `web/src/plugins/diff/split-rows.test.ts` — a context line on both sides, a removed run paired with the added run that follows it, a side left empty when the runs differ in length, and two separate replace runs on their own rows.
- `web/src/plugins/registry.test.tsx` — the new entry's schema literal and catalog parity.
- `web/src/plugins/api.test.ts` — the `openDiffHere` capability sending `openDiffFor`.
- `web/src/plugins/shell/ShellTabMeta.test.tsx` and `web/src/shared/HarnessTabMeta.test.tsx` — the button on a workspaced tab, and its absence on one without a workspace.

## Out of scope

- Any action that modifies the change set: staging, unstaging, discarding, or committing.
- Any write to the user's git index, including intent-to-add.
- Comparing against anything other than the working tree and `HEAD`: no branch, tag, or commit refs.
- A staged/unstaged split, offered during planning and declined: the change set is always all changes versus `HEAD` in one list.
- Inline review comments on diff lines.
- Editing the file's content from the diff tab; every write stays inside the editor tab.
- Docking the diff tab into a sidebar: it is a full-width view and `dockTab` is not among the capabilities it declares.
- Persisting the tab or its contents across a restart.

### Gaps researched and declined

These were raised against the plan during gap research, and the user declined each. They are recorded here so that no later phase proposes them again as though they were new.

- **Expanding wider context.** GitHub Desktop's arrows above and below the line numbers load the next few lines and Expand Whole File shows the entire file; GitHub's View shows the whole file with the proposed changes; VS Code expands unchanged regions. Declined: the double-click that jumps to the line already reaches the wider context in the editor tab, which owns showing a whole file.
- **Viewed state per file with a progress tally.** GitHub marks a file Viewed, collapses it, and unmarks it when the file changes again. Declined for this version: the tracking is review state the tab does not own, and the tab recomputes continuously enough that a viewed mark would fight the live update.
- **Filtering the file list.** GitHub filters by file type, CODEOWNER, viewed, and deleted, and lazygit filters by status. Declined: the change set is the workspace's own current state rather than a backlog to narrow, and the plan carries no cap, so there is nothing to filter down from that a re-scope cannot do.
- **A total change summary.** GitHub Desktop heads its list with "3 changed files" plus counts. Declined: the per-file counts already say it, and the search tab's precedent is a header that carries no tally.
- **A rich diff for markdown and manifest files.** GitHub renders a preview beside the source. Declined: the markdown tab and the editor tab already own those views, and a two-pane preview duplicates both.
- **An image diff with 2-up, swipe, or onion skin.** GitHub compares changed images in place. Declined: the binary entry's media link already reaches the file in its own tab, and a comparison overlay is its own feature.
- **Copying a file's path to the clipboard.** lazygit's `y` copies the selected path. Declined: the editor tab already owns copy-path, and the file is one click away in it.

## Verification

`$janissary/scripts/run.mjs check-diff` after each change, and a production `npm run build` in `web/` with the diff plugin's modules confirmed in their own chunk and absent from the entry bundle. Manual: open the app on a project with modified files, run `diff`, and confirm the changed files render as GitHub-style entries with their hunks and line numbers; click a file and confirm it opens in an editor tab; double-click a changed line and confirm the editor tab opens at that line; edit a file and confirm the diff updates without touching refresh; press refresh and confirm the same; run `diff src` from another directory and confirm the tab re-scopes rather than opening a second one; open a workspace shell tab and press its **Show diff in the workspace** button and confirm the tab shows that workspace's diff; open the tab on a directory that is not a git repository and confirm the message; open it on a repository with no commits and confirm every file reads as added; open it on a repository with a binary change and confirm the entry opens the media tab for that file. For the three added gaps: switch **Unified / Split** and confirm the same hunks render in two columns with each side's line numbers; click into the body, walk with the down arrow across several files' hunks, confirm the walk stops at the last change, and confirm Return opens the file at that hunk's first changed line; with **Hide whitespace changes** on by default, make a whitespace-only edit to a file and confirm that file leaves the list, then turn the toggle off and confirm it returns.
