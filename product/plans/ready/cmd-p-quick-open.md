# Cmd+P Quick Open

**Complexity: 6/10** — a net-new two-phase, capped, deferred fuzzy-scoring matcher (no repo precedent) plus a new overlay component and hook, a new global Cmd+P chord, and one async/deferred project-rooted reply RPC wired across App/PickerOverlays/useWindowKeys; mostly web with strong picker/SearchBar precedent and reuse of feature 1's async listing module, but keeping both the server (non-blocking listing) and the UI (fast per-keystroke fuzzy over a whole project) responsive, plus the launch-dir-vs-active-cwd open-path resolution and the deferred-reply error path, are real performance/correctness work.

Pressing **Cmd+P** (`e.metaKey` + `p`, the same convention as the existing Cmd+F/Cmd+T chords) opens a modal **Quick Open** window — a VS Code-style file finder floating above the command bar. It holds its own text input; as the user types, a scrollable list shows project files ranked by a **fuzzy subsequence** match against each file's relative path (typing `wsprof` surfaces `web/src/ProfilePicker.tsx`). Up/Down move the selection, **Enter** opens the selected file in an editor tab, **Escape** closes without opening anything. The searchable set is every file under the **project/launch directory** (`managers.tab.launchDir`), produced by the same gitignore-aware listing the file-navigator search uses, so `node_modules` and other ignored paths never appear. This gives a keyboard-first "jump to any file in the project" that works from any tab, independent of the file navigator.

## Design decisions

1. **Fuzzy subsequence matching on the relative path.** Matching replicates VS Code Quick Open: a case-insensitive subsequence match against each file's project-relative path, scored so that (a) matches on the **filename** portion outrank matches only in directory segments, (b) consecutive characters and matches at segment/camelCase boundaries score higher, and (c) shorter paths break ties. The single best-scoring file is preselected; the list is sorted best-first (capped — see Decision 11). This is a **new** matcher — no fuzzy matcher exists in the repo (`filterTabs` at `web/src/TabNavPicker.tsx:17` is substring-only). It must run fast on every keystroke over the whole project; how that is kept non-blocking is Decision 11.

2. **Search root is the whole project (`launchDir`).** Results come from every file under `managers.tab.launchDir` (`src/tab/manager.ts:44`), regardless of which tab is active — one consistent result set, matching VS Code's whole-workspace search. This differs from the file-navigator search (feature 1), which is scoped to an individual navigator's root.

3. **Reuses the gitignore-aware file listing from feature 1.** The candidate list is produced by the same server module the file-navigator search introduces (`src/file-tree/search.ts` — `git ls-files --cached --others --exclude-standard` via async `execFile`, with a non-git async-walk fallback), called with `launchDir` as the root instead of a tab's root. **Ordering dependency:** this plan depends on that module existing; if this feature is built first, it creates the module and feature 1 reuses it. Either way the module is **asynchronous**, takes an absolute root, and returns root-relative file paths — async so a large-project walk never blocks the server event loop, and the `projectFiles` reply is deferred until it resolves (Decision 10).

4. **Empty query shows an empty list; rows show filename + dimmed path.** With no text typed the list is empty with a "type to search" hint (no full-project dump). Each result row shows the **filename** prominently and its **relative directory path dimmed** beside it (VS Code style), with the matched characters highlighted (reuse the `<mark>` highlight approach from `web/src/TabNavPicker.tsx:37`). A query with no matches shows the single line **No matching files** and Enter is a no-op.

5. **Enter opens in the editor via the `edit` command, using an absolute path.** Selecting a file dispatches the existing `command` RPC with `edit <absolutePath>` (the same command `FileTreeTab` uses at `web/src/FileTreeTab.tsx:64`), which opens or focuses an editor tab for that file. **Critical:** the returned paths are relative to `launchDir`, but `edit` resolves a relative argument against the **active tab's** cwd — which is not necessarily `launchDir`. So the command must use an **absolute** path (`launchDir` joined with the relative path), not the bare relative path. To supply it, the search reply carries the absolute project root alongside the relative paths; the client joins them for the `edit` command while still displaying the relative path in the list. Opening reuses the editor tab's normal open/de-dupe behavior — no new open path is introduced.

6. **Self-contained key handling, modeled on `SearchBar` (not the modal-picker chain).** Quick Open is unique among the overlays in owning its own text input, so — unlike the theme/task/nav pickers that route keys through `dispatchModalKey`/`keyboard-handlers.ts` — its input handles its own keys and `stopPropagation`s them, exactly as `SearchBar` does (`web/src/SearchBar.tsx:29-35`): Up/Down step the selection, Enter opens, Escape closes and restores focus, and typed characters flow through the input's `onChange`. The only window-level additions are the Cmd+P opener and gating transcript-scroll keys while the overlay is open (mirroring the existing `searchOpen` gate at `web/src/useWindowKeys.ts:168`).

7. **Cmd+P opener with `preventDefault`.** A new branch in `handleChordKeys` (`web/src/useWindowKeys.ts:139`) opens Quick Open on `e.metaKey && e.key.toLowerCase() === 'p'`, calling `preventDefault` to suppress the browser Print dialog — modeled on the adjacent Cmd+F branch. `Ctrl+P` (transcript scroll-up, `product/specs/transcript.md:25`) is unaffected because it is `ctrlKey`, not `metaKey`.

8. **List fetched once per open, filtered client-side, with a loading state.** Opening Quick Open issues one request for the project file list; the client holds it in memory and re-runs the fuzzy match on every keystroke (no per-keystroke round-trip), the same in-memory-filter pattern as `useTabNav` (`web/src/useTabNav.ts:12`), kept responsive per Decision 11. The window renders immediately; while the list request is still in flight the input is live and the body shows a brief **Searching…** state (never a frozen window). A reply that arrives after the window was closed is dropped (guarded), so a late list can't repopulate a closed window. Re-opening re-fetches so the list reflects current on-disk state.

9. **Wording.** Input placeholder **Search files by name**; empty-results line **No matching files** (VS Code wording, as chosen — distinct from feature 1's `(no matching files)`).

10. **`projectFiles` replies asynchronously (deferred); delegate off `controller.ts`.** The reply transport supports a deferred reply — `reply` is `(event) => ws.send(...)` (`src/index.ts:108`) and can be called later, and `client.request<T>()` resolves whenever the reply for its id arrives (`web/src/ws.ts:51-53,66`). So the handler kicks off the async listing and calls `reply({ ..., result: { root, paths } })` from its `.then()`, `return`ing before the trailing `result: 'ok'` reply (`src/message-handler.ts:95`). **The async path must `.catch` and still reply** (empty `{ root, paths: [] }`), since the outer `try/catch` in `src/index.ts:108-110` only catches synchronous throws — otherwise `client.request` hangs. This differs from the inline `undoFileTreeItem`/`complete` handlers. Because `controller.ts` is size-constrained (267 lines; file-tree RPCs already bridge to a module, `src/controller.ts:187-188`), wire `projectFiles` through a small bridge (as `openTranscriptFor` bridges straight to a module at `src/message-handler.ts:90-93`) rather than a fat controller method.

11. **Rapid, non-blocking fuzzy filtering (two-phase, capped, deferred).** Scoring every project path on every keystroke is the one place this feature can jank on a large repo, so the matcher is built for speed: (a) a **cheap first pass** does only a subsequence-*presence* check (a single left-to-right character walk per path, no scoring, bailing the moment a query char is missing) to discard the large majority of non-matches; (b) only the survivors get the fuller boundary/consecutive **scoring**; (c) the result is **capped to the top N** (e.g. 100) and only those N are sorted and returned with highlight ranges — the DOM never renders thousands of rows. The filter runs against the query via `useDeferredValue` (or an equivalent low-priority update) so keystrokes stay responsive and the input never lags behind typing even mid-scan. An empty query short-circuits to no work (Decision 4). Combined with the async server listing, neither the server nor the UI thread blocks at any point.

## What already exists (reuse, don't rebuild)

| Need | Reuse | Location |
|---|---|---|
| Gitignore-aware project file list (files only, root-relative), **async** | `src/file-tree/search.ts` (introduced by feature 1) | feature 1 plan `file-navigator-search.md` |
| Async, non-blocking git invocation (`execFile`) | `changedPaths` / `currentBranch` | `src/git-status.ts:41-65` |
| Deferred RPC reply (invoke `reply` later; `client.request` resolves on the id); bridging off `controller.ts` | reply plumbing / `client.request`; `openTranscriptFor` bridge | `src/index.ts:108`; `web/src/ws.ts:51-53,66`; `src/message-handler.ts:90-93` |
| Keeping a heavy per-keystroke filter off the critical path | `useDeferredValue` | React 19 (`react@^19.2.0`, `createRoot` at `web/src/main.tsx:7`) |
| Project/launch directory root | `TabManager.launchDir` | `src/tab/manager.ts:44` |
| Opening a file in an editor tab | `edit <path>` via the `command` RPC | `web/src/FileTreeTab.tsx:64`; `OpenFileManager.edit` `src/open-file-manager.ts:47-52` |
| RPC-with-reply / fire-and-forget from the client | `client.request<T>()` / `client.send()` | `web/src/ws.ts:66,61` |
| Overlay with its own autofocused input + self-handled keys that stop propagation | `SearchBar` | `web/src/SearchBar.tsx:28-55` |
| Modal overlay slot above the command bar | `PickerOverlays` | `web/src/PickerOverlays.tsx` |
| A picker hook holding open/query/index/in-memory-filtered results | `useTabNav` | `web/src/useTabNav.ts` |
| Match highlight (`<mark>`) and row/selection markup | `TabNavPicker` (`highlightLabel`, `.picker-row`) | `web/src/TabNavPicker.tsx:37,65-73` |
| Adding a Cmd chord opener with `preventDefault` | Cmd+F / Cmd+T branches in `handleChordKeys` | `web/src/useWindowKeys.ts:140,150` |
| Gating transcript-scroll keys while a modal input is open | `searchOpen` gate | `web/src/useWindowKeys.ts:168` |

## Proposed changes

**Server — project file listing.**
- Reuse feature 1's **async** `src/file-tree/search.ts` listing function, ensuring it takes an **absolute root** argument (so it can be called with `launchDir`). If this feature lands first, create that module per feature 1's plan (async `execFile` + async walk fallback).
- Add a request/reply RPC (e.g. `projectFiles`, params `{}`) to the `RpcCall` union in `src/protocol.ts` and dispatch it with a **deferred** reply in `src/message-handler.ts`: `await` (via `.then()`) the async listing called with `managers.tab.launchDir`, then `reply({ ..., result: { root: <absolute launchDir>, paths } })` and `return`; add a `.catch()` that replies `{ root, paths: [] }` so a failure never leaves `client.request` pending (Decision 10). Bridge to a small module rather than a fat `controller.ts` method.

**Web — fuzzy matcher (new module, e.g. `web/src/fuzzy-match.ts`).**
- A pure function taking the candidate relative paths, the query, and a result cap `N`, returning at most `N` matches ranked best-first, each with the score and the matched-character index ranges for highlighting. Implement the **two-phase** scan of Decision 11: a cheap subsequence-presence check first (character-by-character, bail on the first missing query char — avoid complex/backtracking regex, the repo lints `security/detect-unsafe-regex`), then the fuller boundary/consecutive/filename-weighted scoring on survivors only, then sort and slice to `N`. Compute highlight ranges only for the returned top-`N`, not for every candidate. Keep it under the 200-line `max-lines` limit, splitting scoring helpers into the same module or a sibling if needed, with a colocated `fuzzy-match.test.ts`.

**Web — Quick Open overlay (new component, e.g. `web/src/QuickOpen.tsx`).**
- Renders an autofocused input (modeled on `SearchBar`), the capped results list (only the top-`N` rows, modeled on `TabNavPicker`: highlighted filename + dimmed relative directory), and the loading/empty/no-match states (**Searching…** while the list loads, per Decision 8). Receives the already-filtered top-`N` results and callbacks (`onPick(relPath)`, `onClose`) plus current query/selection as props or via its hook. Handles Up/Down/Enter/Escape in its input's `onKeyDown` with `stopPropagation`, exactly like `SearchBar`. Keep the component focused and under `max-lines`.

**Web — Quick Open hook (new module, e.g. `web/src/useQuickOpen.ts`).**
- Mirrors `useTabNav`: holds `open`, `query`, `index`, a `loading` flag, the fetched `{ root, paths }`, and the fuzzy-filtered top-`N` results (`useMemo` over the matcher, keyed on the **deferred** query via `useDeferredValue` so typing stays ahead of the scan — Decision 11). `openQuickOpen()` resets state, sets `open` and `loading`, and fetches via `client.request({ method: 'projectFiles' })`, storing `{ root, paths }` and clearing `loading` on resolve **only if still open** (drop late replies). `pickFile(relPath)` dispatches `command` with `edit <root>/<relPath>` (absolute, per Decision 5) and closes.

**Web — wiring.**
- `web/src/PickerOverlays.tsx`: add the Quick Open props and a render branch for the overlay (placed in the existing priority chain).
- `web/src/App.tsx`: instantiate `useQuickOpen`, pass its state/callbacks into `PickerOverlays` and the window-key snapshot/callbacks.
- `web/src/useWindowKeys.ts`: add a `quickOpenOpen` field to `StateSnapshot` and an `openQuickOpen` callback; add the Cmd+P branch in `handleChordKeys` (Decision 7); include `quickOpenOpen` in the scroll-key gate alongside `searchOpen` (Decision 6). Because the overlay handles its own keys, no `dispatchModalKey` branch or `keyboard-handlers.ts` handler is required.

## Tests

- **`web/src/fuzzy-match.test.ts`** (new): subsequence matching is case-insensitive; the cheap presence pre-filter rejects a non-subsequence query (and does not score it); a filename-portion match outranks a directory-only match; consecutive/boundary matches outrank scattered ones; shorter paths break ties; the result is capped to `N` and sorted best-first; highlight ranges are returned only for the top-`N` and cover exactly the matched characters; a large synthetic input (e.g. 50k paths) filters within a small time budget.
- **`web/src/QuickOpen.test.tsx`** (new): the window renders immediately in a **Searching…** state before the list resolves and switches to results after; empty query renders the empty/"type to search" state with no rows; a matching query renders the capped ranked rows with filename + dimmed path and highlighted characters; Up/Down move the selection and the keys do not propagate to the window; Enter calls `onPick` with the selected relative path; a non-matching query shows **No matching files** and Enter is a no-op; Escape calls `onClose`; a `projectFiles` reply arriving after close does not repopulate the window.
- **`web/src/useWindowKeys` coverage** (extend the relevant existing test): Cmd+P opens Quick Open and calls `preventDefault`; Ctrl+P does **not** open it.
- **Server** — covered by feature 1's `src/file-tree/search.ts` tests; add a focused test that the `projectFiles` RPC replies (deferred) with the absolute `launchDir` root and its relative paths, and that a failing root still replies `{ root, paths: [] }` rather than hanging (extend `src/controller.test.ts` or a colocated message-handler test).

## Out of scope

- **File-content / text search** (VS Code's Ctrl+Shift+F) — Quick Open finds files by path/name only.
- **VS Code Quick Open operators** — the `:` line-number suffix, `@` symbol search, `#` workspace-symbol search, and `>` command palette are not implemented; the input is a plain filename query.
- **Recently-opened / most-recently-used ordering** on empty query — the empty state shows nothing rather than a recent-files list.
- **Opening in a split / to the side** — files open in an ordinary editor tab via `edit`, in the active tab's group as `edit` already places them.
- **Searching multiple roots** or per-tab cwd scoping — the search is always the single project/launch directory.
- **Persisting** the query or fetched list across close/reopen.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff` after each change (lints changed files, typechecks affected projects, runs server + web tests for the touched areas).
- Manual end-to-end check:
  1. Launch the app in a project with nested directories and a populated `node_modules`.
  2. From any tab, press **Cmd+P**; confirm the Quick Open window appears with focus in its input and no browser Print dialog opens.
  3. Type a fuzzy query spanning directory and filename (e.g. `wsprof`); confirm `web/src/ProfilePicker.tsx` ranks at or near the top, with matched characters highlighted and the directory shown dimmed.
  4. Press **Enter**; confirm the file opens in an editor tab showing the correct file (verifying the absolute-path resolution — try it from a tab whose cwd differs from the project root).
  5. Type a query that would only match inside `node_modules`; confirm nothing appears.
  6. Type gibberish; confirm **No matching files** shows and Enter does nothing. Press **Escape**; confirm the window closes and focus returns to where it was.
  7. Confirm **Ctrl+P** still scrolls the transcript up and does not open Quick Open.
  8. **Performance:** in a large project (populated `node_modules`, thousands of tracked files), press Cmd+P while a harness/agent tab is actively streaming output. Confirm the streaming and the rest of the UI never freeze (the listing runs off the event loop), the window appears immediately in its **Searching…** state, and then type quickly through a several-character query — confirm the input keeps up with no perceptible per-keystroke lag and the list stays responsive (two-phase + capped + deferred filtering).
