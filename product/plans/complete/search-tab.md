# Search Tab

**Complexity: 8/10** — a new bundled plugin spanning both trees, two new additive plugin-API capabilities, a two-phase prioritised scan with cancellation and glob filtering, three matcher modes, a new global chord that has to be ordered ahead of the existing Cmd+F branch, and a result set whose first-row latency is a design requirement rather than an accident; no new wire type and no persistence, and every mechanism it needs is an established one.

A **search tab** searches the entire project repository for an expression, as plain text or as a regular expression, and presents the matches as a navigable table. Each row is one match: a header carrying the file path and line number, and the matching line with its surrounding context. Selecting a row — by click or by Return on the keyboard-selected row — opens that file in an editor tab with the matching line centered in the window.

The feature is motivated by a real gap: Janissary can find a file by name (`Cmd+P` Quick Open, `product/specs/quick-open.md`) and find text inside one open buffer (the editor's in-buffer fuzzy search, `product/specs/editor-tab.md`), but there is no way to find *where a string appears across the repository*. Every other reference to a symbol today is a `grep` typed into a shell tab, whose output is a wall of text with no path-to-line affordance.

## Product decisions

Each of the following was answered by the user during planning and is binding on the implementation.

### Opening a result

Opening a match reuses the editor tab's existing de-duplication: if that file is already open in an editor tab, the existing tab is focused and its cursor moves to the start of the matching line, the selection is dropped, and the line is scrolled into view — including when the same line is requested twice in a row. Otherwise a new editor tab opens with the cursor on that line and the line centered. This is exactly what `edit <file>:<line>` already does, so the search tab introduces no second open path.

### Scope of the search

The searchable set is every file under the project's launch directory, gitignore-aware — the same set `Cmd+P` Quick Open searches (`git ls-files --cached --others --exclude-standard`, with the existing recursive-walk fallback when the root is not a git repository). Two classes of file are refused before their contents are searched:

- files over 2 MB, the editor tab's own `EDITOR_MAX_BYTES` limit, because a match in one could not be opened in an editor tab anyway;
- files whose bytes look binary.

Both are content checks, not extension lists, so extensionless files such as `Makefile` and `.gitignore` are still searched.

**Files to include and files to exclude.** Two further fields beside the query take **comma-separated glob patterns**, matching the syntax VS Code documents: a bare `example` matches any file or folder of that name at any depth, a leading `./` anchors to the launch directory, patterns are separated by commas, and paths use forward slashes. An empty include field means the whole repository; an empty exclude field excludes nothing. The patterns filter the gitignore-aware list before any file is read, so a narrowed search is also a faster one.

The `.gitignore` behaviour itself is **not** exposed as a toggle. The file list is gitignore-aware by construction and the plan keeps it that way, so a user who wants a different rule set gets it by editing their own ignore files, the way `git grep` behaves.

### How a search is started

Two routes open or focus the tab: the `search` command typed in any command bar, and a global **Cmd+Shift+F** (Ctrl+Shift+F elsewhere). Both are the same route — the plugin's own command, resolved by its declaration.

Inside the tab, a search bar is drawn in the application's own `CommandBarShell`, so it is styled exactly like the agent tab's command bar rather than being a second textarea that drifts from it. The query is edited in place there, and **the results update as the query is updated**, on a 200 ms debounce so that typing does not start a scan per keystroke. The bar has no command history and no ghost suggestion, so `useCommandBarKeys` is composed with an empty history. An empty query clears the results rather than searching for the empty string.

### Plain text versus regex, case sensitivity, and whole word

Three toggles in the tab's metadata header: **regex**, **match case**, and **whole word**.

- **Regex off (the default)** — the query is a literal substring.
- **Regex on** — the query is a JavaScript regular expression. One that will not compile is reported as a rejection on the originating transcript and the plugin keeps running; it is never a reason to disable the plugin, and no scan starts.
- **Match case off (the default)** — matching is case-insensitive. On, it is case-sensitive.
- **Whole word off (the default)** — on, a match must be bounded by a non-word character or the start or end of the line. Independent of the other two, and it composes with regex the way it does in VS Code and Zed: in regex mode the query is taken as written and the whole-word bound is applied around it.

The three flags are carried in the intent that starts a scan, so every rerun sends the current set and the server never holds them.

### What the result table shows

One row per match, in **file path then line number** order. Files are read in sorted path order, and each batch's rows append with a single tab update, so the order the user sees is path then line from the first row rather than reshuffling as reads finish out of order.

Each row is one block: a **full-width dimmed header carrying the project-relative file path and the line number**, then the **two context lines above** the match, the **matching line** itself highlighted within the match, and the **two lines below**. The matching line also carries its own line number. Context is clipped at the start and end of a file rather than padded.

The rows **stream in** as the scan finds them rather than appearing all at once, so a large repository fills the table while it is still being searched. Streaming never moves the selection: a highlighted row stays highlighted as more rows arrive beneath it, and a selection index past the end of the rows received so far is ignored. **A new query cancels the scan still running** and starts a fresh one, so only one scan is ever in flight and a superseded scan's rows are discarded rather than appended.

There is **no result cap**: every match is streamed, and the table holds them all.

### Header and body states

The metadata header carries **only the three mode toggles**, at its right edge alongside the host's Split control. It shows no query echo, no match count, and no file count. The include and exclude fields sit in a row directly beneath the header, above the search bar, so the header stays a header.

The table body carries the state:

- **Searching…** while a scan is running.
- **No matches found for `<query>`.** when a scan settles with nothing.
- The specific reason when a scan fails, as one line in the body.

### Navigation

The search bar and the result table never both claim a key, because **only the focused element receives arrow keys**. The table is a focusable element in its own right: clicking anywhere in it focuses it and selects the row clicked, and while it holds focus the arrow keys move the selection, Home/End jump to the first and last row, and `Return` opens the selected match. The search bar keeps its arrows for caret movement whenever it holds focus. To move the selection by keyboard without a mouse, click the table once or Tab into it.

A click on a row both selects and opens it — one click, not a double click. That is a deliberate departure from the other plugin lists, where a first click only highlights, and it is why this list holds its own click handler rather than using `useListSelection`'s `rowClicked`.

Selecting a row is by index into the rows received so far, so a selection made before more rows arrive still names the same match, and streaming never moves it. An index past the end of the rows received so far is ignored rather than opening whatever landed there.

Opening a match **leaves the search tab open** with its query and results intact, and the editor tab takes focus. A second match can be opened without retyping.

### Lifecycle

The tab is a singleton addressed by one instance key, so `search` and Cmd+Shift+F focus the existing tab rather than opening a second one, and a new query repaints that same tab in place. The tab is a live, in-memory view tab like every other plugin tab: it is not persisted and is not restored on `--relaunch`.

## Design decisions established by the feature text

- **It is a plugin.** The feature says "implemented as a new plugin", so it is a bundled tab plugin in `src/plugins/search/` and `web/src/plugins/search/`, added to both loader maps and the catalog. It is not core.
- **It is a tab, not an overlay.** "a new search tab" — a persistent view tab, matching the other list plugins, not a Quick-Open-style modal.
- **It searches the entire project repository.** The searchable set is the project's launch directory, gitignore-aware.
- **Plain text or regex.** Both modes are offered.
- **Results are a table.** One row per match, not one row per file.
- **Each row shows the match and surrounding context lines**, with **a header that includes file path and line number**.
- **Keyboard or mouse navigable.** Arrow keys move the selection; `Return` on the selected row and a click on any row both open the file.
- **Opening the result centers the matching line.** Clicking or Return "will cause that file to be opened in a new editor tab with the matching line in the center of the window."

## What already exists (reuse, don't rebuild)

| Need | Existing thing | Where |
| --- | --- | --- |
| Project file list, gitignore-aware | `listProjectFiles(root)` — `git ls-files --cached --others --exclude-standard`, with a recursive-walk fallback. Reached through the new `projectFileList` capability, which calls `projectFilesFor` in `src/project/files.ts`, the same function the `projectFiles` RPC serves to Quick Open | `src/file-navigator/search.ts`, `src/project/files.ts` |
| Launch directory | `managers.tab.launchDir` | `src/tab/manager.ts` |
| A command-opened, file-less list plugin | `schedules` and `sessions`: pure manifest, import-free `shared.ts`, `activate.ts`, `noFileOpener`, `defineDockableList`, `defineIntents` | `src/plugins/schedules/`, `src/plugins/sessions/` |
| The shared plugin look | metadata header, right-aligned action group, centering stage | `web/src/plugins/shared.css` |
| Opening a file in an editor tab at a line | `OpenFileManager.edit(command, path, label, line)`; `edit <file>:<line>` grammar | `src/open/file-manager.ts`, `src/commands/edit.ts` |
| Editor tab line targeting | the requested line gets the cursor and is scrolled into view; re-requesting the same line still re-centers | `product/specs/editor-tab.md` |
| Glob matching for the include and exclude fields | `node:path`'s `matchesGlob`, available on the Node version this project runs | `node:path` |
| Regex matching semantics already used by the app | `compilePattern`, `matchRange` in `src/search-matches.ts` (case-insensitive `new RegExp`, invalid pattern returns null) | `src/search-matches.ts` |
| Row selection by keyboard | `useListSelection` / `nextListSelection`, published on the client plugin API and used by the sessions and conversations lists | `web/src/shared/list-selection.ts` |
| The command bar to draw the search bar in | `CommandBarShell` and `useCommandBarKeys`, published on the client plugin API; the conversations composer already composes them | `web/src/shared/command-bar/` |
| The chord dispatch table the new chord joins | `metaChordOpener` in `web/src/useWindowKeys.ts` | `web/src/useWindowKeys.ts` |
| Where the `search` command name is checked for collision | `createPluginCommands` in `src/plugins/command-adapter.ts`, which refuses a claim against `ROUTE_NAMES` and every core command. `search` is not among them — the existing `search` command is `search transcript`, a different first-token claim, so no collision arises | `src/plugins/command-adapter.ts`, `src/commands/search.ts` |

**Not reused, and why.** There is no binary-detection helper anywhere in `src/`, so the content check is new code rather than a call. It is a null-byte scan over the first bytes read from each file, the same test `grep` and `git grep` apply. There is no existing debounce helper in `web/src/`, so the 200 ms debounce is a `setTimeout` in the search bar's own hook, cleaned up on unmount and on every new keystroke so a pending search never fires after the tab closes.

## Implementation decisions

Each of the following was answered by the user during planning and is binding on the implementation.

### Scheduling the scan

The scan is **two-phase and prioritised**, and this is a deliberate correction to the obvious design rather than an optimisation.

A single-phase scan that reads files in order and reports what it finds has good throughput and **bad first-result latency**: the earliest-pathed file in a large repository may contain no match, and the user stares at an empty table until the scan reaches the file that does. Zed measured this on the Linux kernel tree and found a first match arriving after 16.8 seconds on a cold query and 3.8 seconds on a warm one, with throughput matching ripgrep throughout — the entire cost was in ordering, not in speed. A plan that streams rows in strict path order reproduces that failure exactly.

So the scan runs in two phases:

1. **Detect.** Each candidate file is read once and asked only whether it contains a match at all. This phase reads every byte of every candidate file, so it cannot be made cheaper — but it produces a small answer per file, so the files that match become known early.
2. **Resolve.** The files that matched are read again and fully matched into rows with their context. **This phase is prioritised over phase one**: a file already known to contain a match is always resolved before an as-yet-unscanned file is detected. That is the whole of Zed's fix, and it is what turns a 16.8-second wait into the first rows appearing almost immediately.

The tab shows `Searching…` from the moment a scan starts, and the first rows appear as soon as any file resolves — on a typical query, well before the scan has visited every file. Files are still visited in sorted path order and rows are still appended in path-then-line order, so prioritisation changes **when** rows arrive, not the order they appear in.

Reads are bounded-concurrency in both phases, and each phase's results reach the tab as one `updateTab` per batch, which bounds how many times a long scan repaints the tab.

### Cancelling a scan

Each scan carries an **`AbortController` threaded into the read layer**, so a new query actually tears down the reads in flight rather than letting them finish and be discarded. A batch whose signal is already aborted delivers nothing. The signal reaches the file-list step and both read phases; the pure matching step takes no signal because it holds no I/O and completes synchronously.

### Header and toggles

The search tab **renders its own `plugin-meta` header row** carrying the three toggles, following the same shape the markdown, image, and video plugins use, with the host's Split control beside them. `PluginActionsHeader` is not used: this tab never docks, so its portal target is always absent and the toggles would need the same fallback row anyway.

The toggles are **client-local view state**, not server state. The server does not need to know which are on, because the query a scan runs carries all three flags in the intent that started it, and a rerun always sends the current set with the query.

### The shape of a streamed row

One **row object carrying its own path, its line number, and its five lines of text** — the two context lines above, the matching line, and the two below. A row is self-describing, which is what "a header that includes file path and line number" on each entry means, and the client renders the object directly without zipping parallel arrays. The matching line carries its own line number within the row, so the client can label it without deriving anything the server did not send.

Context lines carry their text only, not their own line numbers: the header's line number plus the position within the block gives each of them, and sending five numbers per row to display one is not worth the payload. Context is clipped at the start and end of a file, so a block may hold fewer than five lines and never padded.

### The include and exclude fields

Both fields are **client-local view state** like the toggles, and both are carried in the intent that starts a scan, so the server holds no filter state and a rerun always sends the current pair.

Matching is by **`path.matchesGlob` from `node:path`**, which is on the Node version this project runs and which the repo does not otherwise use. No glob library is added. The syntax follows VS Code's documented behaviour: a bare pattern matches at any depth, a leading `./` anchors to the launch directory, patterns are comma-separated, and paths are forward-slashed project-relative paths — the same form `listProjectFiles` already returns, so no path rewriting is needed. An invalid pattern is not an error: it is a pattern that matches nothing, the same way a mistyped include field behaves in VS Code.

An include field that names a file or directory prefix also matches everything beneath it, so `src` includes `src/**`. That is the behaviour a user means by it, and it is what makes the field useful for narrowing rather than only exact selection.

## Proposed changes

### New plugin `search`

Server tree, no barrel file:

- `src/plugins/search/manifest.ts` — `id: 'search'`, `command: 'search'`, `fileExtensions: {}`, no `notifications`, and exactly the capabilities it uses: `openOrFocusTab`, `updateTab`, `projectFileList`, `openInEditor`, `rejectRequest`, `reportFailure`. Pure data.
- `src/plugins/search/shared.ts` — `SEARCH_PAYLOAD_SCHEMA_VERSION`, the payload type, the intent payload types, and hand-written import-free guards. The payload carries the query, the include and exclude patterns, the three mode flags, the scan's state (`searching`, `done`, or `error`), the state message when it is an error, and the match rows received so far. The client executes these guards through `@shared`.
- `src/plugins/search/compile-matcher.ts` — the pure part: turn a query plus the three mode flags into a matcher, or `null` for an empty query or a regex that will not compile. Case sensitivity, the literal/regex choice, and the whole-word bound are all resolved here, so one module owns the matching semantics.
- `src/plugins/search/filter-paths.ts` — the pure part: apply the include and exclude glob patterns to the file list. Pure, so the glob semantics are testable without a filesystem or a scan.
- `src/plugins/search/search-files.ts` — the pure part: given one file's text and a compiled matcher, return that file's match rows with their context lines, and separately whether the file matched at all, since the two-phase scan asks that cheaper question on its own. It owns context extraction too, because extracting two lines either side of a line number is the same concern as turning lines into rows.
- `src/plugins/search/scan.ts` — the effectful scan: the file list from `projectFileList`, the glob filter, the 2 MB and binary refusals, the two prioritised phases with bounded-concurrency reads, a per-scan `AbortController`, and a batch callback the activation turns into an `updateTab`.
- `src/plugins/search/activate.ts` — `activate()` returning `isPayload`, `opener: noFileOpener('search')`, the `command` that opens or focuses the tab, and `intent` via `defineIntents` for `search` (run a query), `open` (open a match), and `clear` (drop the query and the results).

**Deliberate ceiling.** A batch size and a read concurrency are literal constants, not configuration, and there is no persistent index — every search re-reads the files the query needs, twice in the two-phase design. If a repository proves too slow to scan interactively, the upgrade path is a persistent index built once and consulted per query, which is a new subsystem rather than a tuning knob, and nothing in the plugin's contract blocks it. The 2 MB refusal and the binary refusal are the only two file classes skipped, and both exist so a match can always be opened.

The tab is a singleton addressed by one instance key, so `search` focuses the existing tab and a new query repaints that same tab in place through `updateTab`, appending each completed batch of rows to what the tab already shows. The module holds the in-flight scan and the rows accumulated so far, and `dispose` cancels it and drops that state.

### The Cmd+Shift+F chord

The chord is host-level, not plugin-level: it opens or focuses the search tab by issuing the same `search` command the user would type (`cb.runCommand('search')`, the same shape as the existing `cb.runCommand('agent')` for Cmd+T), so there is one route into the plugin rather than a second.

It goes in `metaChordOpener` in `web/src/useWindowKeys.ts` — the function whose comment already lists "Cmd+F search, Cmd+P quick open" — and it must be matched **before** the existing `if (e.key.toLowerCase() === 'f')` branch, because that branch matches on the key alone and does not test `shiftKey`. Without the reorder, Cmd+Shift+F is swallowed by the transcript search bar. The new branch tests `e.shiftKey` explicitly, so plain Cmd+F keeps opening the transcript search exactly as it does today.

That file is 168 raw lines against a 200-line `max-lines` limit that skips blanks and comments, so the added branch is the last one that fits without an extraction. If it does not fit, the chord openers are extracted into their own module — not compacted.

`product/specs/keyboard-navigation.md` gains the chord in its table and its overlay-priority list is unchanged (this is a tab, not an overlay). `product/specs/tab-plugins.md` is updated to record that a bundled plugin tab may be reachable from a global chord when its command opens a singleton tab like this one.

**Ordering constraint.** The chord cannot be added before the search tab exists, or Cmd+Shift+F would type `search` into whatever tab the user is in. The client chord and the plugin registration land in the same change.

### Client tree, one component per file

- `web/src/plugins/search/index.tsx` — default-exports the component, named-exports `isPayload`.
- `web/src/plugins/search/SearchTab.tsx` — the tab: the metadata header with the three toggles, the include and exclude row, the search bar, and the result table. It holds the debounce, the three mode flags, and the two filter fields, and nothing else.
- `web/src/plugins/search/SearchBar.tsx` — the search bar, composing `CommandBarShell` and `useCommandBarKeys` with no history and no ghost.
- `web/src/plugins/search/ResultTable.tsx` — the rows: the dimmed path-and-line header, the context lines, and the highlighted matching line.
- `web/src/plugins/search/result-selection.ts` — the selection state, built on the host's published `useListSelection` so this list moves its current row the same way the schedules, sessions, and conversations lists do, plus the one rule `useListSelection` does not cover: that a click on a row **opens it on the first click**. `useListSelection`'s own `rowClicked` opens only on a second click on an already-highlighted row, which is the right rule for a list of records the user inspects and the wrong one here, so this module uses `navigate` for the keys and holds its own click handler rather than using `rowClicked`. That is the only reason it is not `useListSelection` directly.
- `web/src/plugins/search/search.css` — the plugin's own look.

Registration: a catalog entry in `src/plugins/catalog.ts`, a literal dynamic import in `src/plugins/loaders.ts`, and one in `web/src/plugins/registry.tsx` with the schema version as a literal.

## Tests

- `src/plugins/search/shared.test.ts` — every guard accepts a well-formed value and rejects a malformed one, arrays and `null` included.
- `src/plugins/search/compile-matcher.test.ts` — literal and regex matching, case sensitivity in both directions, the whole-word bound in both modes, an empty query, and a regex that will not compile returning null.
- `src/plugins/search/filter-paths.test.ts` — a bare pattern matching at any depth, a leading `./` anchoring to the launch directory, comma-separated patterns, an empty include field meaning everything, an empty exclude field excluding nothing, and a pattern matching no file.
- `src/plugins/search/search-files.test.ts` — match rows with their context, context clipped at the start and end of a file, several matches in one file, a file with no match, the two-lines-either-side window, and the cheap "does it match at all" answer agreeing with the full one.
- `src/plugins/search/scan.test.ts` — the file list arriving from the capability and then being glob-filtered, binary and oversized files skipped, **a file known to match resolving before an unscanned file is detected**, rows delivered in path order, a cancelled scan delivering nothing further, and one scan at a time.
- `src/plugins/search/activate.test.ts` — command opens and focuses, an invalid regex is rejected rather than thrown, an empty query is rejected, each intent accepts and rejects as declared, a new query cancels the scan in flight, and `dispose` releases.
- Host tests for both new capabilities in `src/plugins/context.test.ts` or beside it: `projectFileList` returns the launch directory's gitignore-aware paths, `openInEditor` opens an editor tab at the requested line, and a plugin that did not declare either is disabled on use.
- `web/src/plugins/search/SearchTab.test.tsx` — lazy loading, payload validation, the header carrying only the toggles, all three toggles emitting a new search, the include and exclude fields emitting a new search, the `Searching…` and no-match states, the error line, arrow-key and Home/End selection, and both Return and a single click emitting the open intent.
- `web/src/plugins/search/result-selection.test.ts` — the selection rule, that a single click opens, and that streaming rows never move the selection and never invalidate an index.
- `web/src/plugins/registry.test.tsx` — the new entry's schema literal, and the existing catalog-parity test extended for `search`.
- `web/src/useWindowKeys.test.ts` — Cmd+Shift+F issuing the `search` command, and **plain Cmd+F still opening the transcript search bar**, pinning the ordering against the branch that would otherwise swallow the new chord.

### Ordering the implementation so the tree stays green

Land in this order, each step typechecking and passing its own tests on its own:

1. `projectFileList` and `openInEditor` in `api-capabilities.ts` and `context.ts`, with their host tests, and the registry-parity test that a capability named in the union is listed in `CAPABILITIES`.
2. `src/plugins/search/shared.ts` and its guards.
3. `compile-matcher.ts` and `search-files.ts`, the pure matching half.
4. `scan.ts` and `activate.ts`, then the catalog and server loader entries.
5. The client tree, then `web/src/plugins/registry.tsx`.
6. The chord in `useWindowKeys.ts` last, since it depends on the `search` command existing.

`src/plugins/api.ts` and `src/plugins/api-capabilities.ts` are the two files the contract change touches, and `api.ts` re-exports from the latter, so the union and the record move together or `TabPluginCapabilityName` and `CAPABILITIES` disagree and the host refuses a capability it defines.

## Out of scope

- Searching inside a single open editor buffer — the editor already has that (see `product/specs/editor-tab.md`).
- Searching files by name — that is Quick Open (`product/specs/quick-open.md`).
- A saved or persistent index across restarts. Every search reads from disk.
- Fuzzy matching, and any whole-word syntax beyond the whole-word toggle.
- Opening a result in anything other than an editor tab.
- A match count, a file count, or any other result tally in the header or the body.
- Persisting the tab, its query, or its results across a restart.
- Docking the search tab into a sidebar. It is a full-width table and is reached from the centre strip; `dockTab` is not among the capabilities it declares.

### Gaps researched and declined

These were raised against the plan during gap research, and the user declined each. They are recorded here so that no later phase proposes them again as though they were new.

- **Replace across files.** VS Code's search carries a replace field and a Replace All over the workspace, and Zed presents results in an editable multibuffer so a match can be edited in place. Both treat finding and changing as one flow. Declined for this version: every write stays inside the editor tab, which already owns saving, conflict detection, and the close guard on unsaved work, and a plugin writing to disk from a search tab would bypass all three. If it is ever added, it belongs as a pre-filled open rather than a disk write, for the same reason.
- **Search only in open editors.** VS Code restricts a search to currently open files. Declined: every search is a whole-repository scan, and the include/exclude globs already cover the narrowing need.
- **Seeding the query from the editor.** VS Code seeds a repository search from the active editor's selection or the word under its cursor. Declined: it needs an editor-side chord and a hand-off between two tabs, and the query can simply be typed.

## Verification

- `$janissary/scripts/run.mjs check-diff` for lint, typecheck, and the related tests.
- A production `npm run build` in `web/`, then confirm the search plugin's modules are still in their own chunk and absent from the entry bundle.
- Manual: from any tab press Cmd+Shift+F and confirm the search tab opens with the search bar focused; type `search todo` and confirm the same; type a query and confirm rows appear quickly and keep arriving while `Searching…` shows, then settle; **type a query whose only match is late in the alphabetical file list and confirm the first rows still appear promptly rather than after the whole scan**; type a query that matches nothing and confirm `No matches found for "<query>".`; narrow with an include pattern such as `src/**` and confirm only matching files are searched; toggle regex on, type `[unclosed`, and confirm a rejection on the transcript with the plugin still listed as active in `plugins`; toggle whole word on and search `the` and confirm it no longer matches inside a word; select a row with the arrows and press Return, then confirm an editor tab opened on that file with the matching line centered and the search tab still open behind it; Return on the same row again and confirm the existing editor tab is focused rather than duplicated; click a row and confirm the same; select a file already open in an editor tab and confirm the existing tab is focused and re-centered; type a new query mid-scan and confirm only the new scan's rows appear.
