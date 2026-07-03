# Transcript search

**Complexity: 4/10** — a new client-side UI mode (hook, component, pure helper) with keyboard-routing changes in `App.tsx`, highlight/scroll integration in `Transcript.tsx`, and a small server command for the no-match report and non-interactive dispatch.

## Goal

Search the current tab's transcript with a regex, from a search bar that temporarily replaces the command bar. `search transcript <pattern>` enters search mode with the pattern pre-filled; Cmd+F enters with an empty pattern. Matches are highlighted in-place, navigable with arrow keys, and the transcript scrolls to keep the current match visible.

## Design decisions

**Client-side UI mode, no new RPCs.** The client already holds the full flattened transcript (`TabView.bufferLines` at `src/protocol.ts:43`), so matching, highlighting, and scrolling all happen in the web client. The server module exists only for the no-match report, help/completion registration, and non-interactive dispatch.

**`search transcript <pattern>` is intercepted client-side like `hist`.** In `App.tsx`'s `onSubmit` (`web/src/App.tsx:209-215`), alongside the existing `hist`/`quit` interceptions: parse the input, run the regex against the current tab's `bufferLines`. Matches found → enter search mode with the pattern pre-filled and the most recent match current; do not send the command to the server. No matches → let the command fall through to `runCommand`, which sends it to the server where the `search` command module appends "No matches found in the transcript."

**Cmd+F opens search with an empty pattern; Mac-only.** In the window keydown handler (`web/src/App.tsx:105-132`), add a `e.metaKey && e.key === 'f'` branch with `preventDefault()` to suppress the browser find dialog. No Ctrl+F binding — this is a Mac-only shortcut. Only active when the current tab shows the transcript body: `!isViewTab && !current.activePty` (the same gate at `web/src/App.tsx:182`). Monitor tabs are structurally excluded — they live in the reporting section (`ReportingSection`), not the action area.

**Search state lives in a new hook, not `App.tsx`.** `App.tsx` is already 232 raw lines (near the 200-line `max-lines` limit counting non-blank/non-comment). New hook `web/src/useTranscriptSearch.ts` owns: `searchOpen: boolean`, `pattern: string`, `matchIndex: number` (0 = most recent match, counting backward). Matches are derived (memoized) from `(lines, pattern)`: the list of `bufferLines` indices whose `text` matches the regex, compiled case-insensitive (`i` flag). Recomputed when new transcript lines arrive; `matchIndex` is clamped so a live tab doesn't crash the mode. Invalid regex (`new RegExp` throws) → treated as "no search": no matches, result line shows an "invalid pattern" note. The hook also watches the active tab label and closes the mode when it changes (tab switch closes search). Exposes `open(pattern)`, `close()`, `setPattern`, `stepOlder()` / `stepNewer()`, and the derived `currentLineIndex` for the transcript.

**Pure matching logic in a shared helper, not duplicated.** `src/search-matches.ts` exports `findMatches(lines: BufferLine[], pattern: string)` and `compilePattern(pattern: string): RegExp | null` (safe regex compile with try/catch). The web client imports it via the `@shared` alias (`web/tsconfig.json:13` `"paths": { "@shared/*": ["../src/*"] }`, mirrored in `web/vite.config.ts:13`), exactly like `@shared/protocol` in existing web files. The server command imports it as `./search-matches.js` per the NodeNext `.js`-extension rule. This module must stay free of Node-only imports (no `fs`, `path`, etc.) so the web bundle can consume it. Matching skips `type: 'terminal'` and `type: 'spacer'` lines (no meaningful `text`); markdown blocks match on their raw `text`. Unit tests in `src/search-matches.test.ts` cover both client and server usage.

**SearchBar replaces CommandInput when search is open.** New component `web/src/SearchBar.tsx`, rendered in place of `<CommandInput>` in `App.tsx` when `searchOpen`. Result line above the input shows the current match's text plus a position indicator (e.g. `3/17`), or "No matches" / "Invalid pattern" states; nothing when the pattern is empty. Pattern input with `autoFocus`; `onChange` re-runs the search (current match resets to the most recent). Key handling on the input stops propagation so the window handler and `useTranscriptScroll` never see these keys: ArrowUp → older match, ArrowDown → newer match, Escape → close search mode and refocus the command input (`inputReference` from `App.tsx`), Enter → no-op. Styling in `web/src/theme.css`: reuse the `.command-area` layout (`web/src/theme.css:215`); new `.search-bar`, `.search-result` classes so it visually reads as the command bar transformed.

**Substring highlighting on the current match line only.** `Transcript.tsx` (48 lines, ~41 non-blank/non-comment — plenty of room) gains an optional `highlight` prop: `{ lineIndex: number; pattern: string } | null`. `App.tsx` derives this from the hook's `currentLineIndex` and `pattern` and passes it to `<Transcript>`. For the line at `lineIndex`, `renderLine` (`web/src/transcript-line.tsx:19`) gains an optional `highlight` parameter; it uses `matchRange()` from `search-matches.ts` to find the first regex match in `line.text`, splits the text around it, and wraps the matched range in `<span className="search-hit">`. `.search-hit` gets a background color in `theme.css` (both light and dark themes). Markdown lines render sanitized HTML via `dangerouslySetInnerHTML` (`web/src/transcript-line.tsx:16`), so substring wrapping can't be injected safely there; as a fallback, a matched markdown block gets the `search-hit` class on the whole block. Prompt/output/message/collapsed lines get true substring highlighting.

**Scroll: disable pinning, position match near bottom.** While search mode is open with a current match, `Transcript` sets `stick.current = false` (the pinning ref at `web/src/Transcript.tsx:15`) to prevent auto-scroll-to-bottom. A `useEffect` keyed on the highlight target scrolls the highlighted line into view: target `scrollTop` so the match sits ~2 line-heights above the bottom edge (~2 context lines visible above and below). Use a `data-search-hit` attribute on the highlighted line element and query it to compute `offsetTop`; re-run when the highlight target changes or lines change. On close, restore normal behavior by removing the `highlight` prop (the `stick` ref resumes its natural behavior based on scroll position; the user can press Escape to jump to bottom).

**Key-routing priority in `App.tsx`'s window handler.** The handler at `web/src/App.tsx:105-132` checks overlays in this order: (1) route chooser, (2) history picker, (3) **search mode** (new — Cmd+F to open; while open, skip scroll-key handling so ArrowUp/Down don't also scroll the transcript), (4) scroll keys via `handleScrollKey`, (5) tab reordering/moving. Since the search input stops propagation for its owned keys, the window handler only needs to handle Cmd+F and guard against scroll-key collisions while search is open.

**Server command for the no-match report and non-interactive dispatch.** New `src/commands/search.ts` with `name: 'search'`, `match: /^search\s+transcript\b/i`. The `run` function calls `flattenBuffer(log)` from `src/tab-formatting.ts:7` to get `BufferLine[]`, then uses `findMatches` from `search-matches.ts`. No matches → `managers.tab.append(tab.label, { input: command_, output: 'No matches found in the transcript.' })` (the pattern from `src/commands/rename.ts:12`). Matches found (non-interactive path) → report the most recent matching line as output. Missing/invalid pattern → usage line. Register in `src/commands/index.ts` (import from `./search.js`, add to the `commands` array). Add `'search'` to `availableCommands` in `src/commands.ts:6` (the fallback help string). Add `search transcript <pattern>` to the README's `### Commands` section so `buildHelp()` (`src/commands.ts:24`) picks it up for the `help` command.

**Completion for the `transcript` subcommand.** New `completeSearchCommand` in `src/completion-handlers.ts` (argument 1 completes `transcript`), chained in `completeCommandLine` (`src/completion.ts:40-45`) via `??` alongside the existing handlers.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Flattened transcript lines | `TabView.bufferLines` at `src/protocol.ts:43` |
| BufferLine type with `text` and `type` fields | `src/types.ts:38-50` |
| Command interception pattern (`hist`/`quit`) | `App.tsx` `onSubmit` at `web/src/App.tsx:209-215` |
| Window keydown handler with priority chain | `App.tsx` at `web/src/App.tsx:105-132` |
| Transcript stick-to-bottom pinning | `stick` ref at `web/src/Transcript.tsx:15` |
| Line renderer (`renderLine`) | `web/src/transcript-line.tsx:19` |
| Markdown `dangerouslySetInnerHTML` rendering | `Markdown` sub-component at `web/src/transcript-line.tsx:7-17` |
| Command module shape (`name`, `match`, `run`) | `Command` interface at `src/commands/types.ts:5-9` |
| Command registration | `src/commands/index.ts:23-46` |
| `managers.tab.append` pattern | `src/commands/rename.ts:12` |
| `flattenBuffer` for server-side line flattening | `src/tab-formatting.ts:7` |
| Completion handler chain | `src/completion.ts:40-45`, handlers in `src/completion-handlers.ts` |
| Help text from README | `buildHelp()` at `src/commands.ts:24` |
| Fallback help command list | `availableCommands` at `src/commands.ts:6` |
| `.command-area` CSS layout | `web/src/theme.css:215` |
| `@shared` alias for cross-project imports | `web/tsconfig.json:13`, `web/vite.config.ts:13` |
| Transcript-body gate (`!isViewTab && !activePty`) | `web/src/App.tsx:182` |
| Scroll key handler (`handleScrollKey`) | `web/src/useTranscriptScroll.ts` |

## Implementation steps

Each step leaves `check-diff` green; 1 is server-only, 2–4 are web-only.

### 1. Server: shared matcher, command, completion, docs

- `src/search-matches.ts`: `findMatches(lines, pattern)` and `compilePattern(pattern)` — pure functions, no Node imports, so the web client can import via `@shared`.
- `src/search-matches.test.ts`: match ordering, empty pattern, invalid regex, case-insensitivity, skipped line types (`terminal`, `spacer`), match-range extraction.
- `src/commands/search.ts`: `name: 'search'`, `match: /^search\s+transcript\b/i`, `run` uses `flattenBuffer` + `findMatches`. No matches → append report. Matches → report most recent line. Invalid pattern → usage. Import from `./search-matches.js` (NodeNext `.js` extension).
- `src/commands/search.test.ts`: match regex, no-match appends report, non-interactive match reports most recent line, invalid pattern output.
- `src/commands/index.ts`: import `search` from `./search.js`, add to `commands` array.
- `src/completion-handlers.ts`: `completeSearchCommand` (argument 1 completes `transcript`), chained in `completeCommandLine`.
- `src/commands.ts`: add `'search'` to `availableCommands`.
- README.md `### Commands` section: document `search transcript <pattern>`.

### 2. Web: search hook and SearchBar component

- `web/src/useTranscriptSearch.ts`: the hook (state, memoized matches, clamping, tab-switch detection, open/close/setPattern/stepOlder/stepNewer). Imports `findMatches` and `compilePattern` from `@shared/search-matches`.
- `web/src/SearchBar.tsx`: result line + pattern input, key handling (ArrowUp/Down, Escape, Enter no-op), stopPropagation, autoFocus.
- `web/src/SearchBar.test.tsx`: renders result line + input, focus on open, live update on edit, ArrowUp/Down stepping, Enter is a no-op, Escape closes and refocuses command input, no result shown for empty pattern.

### 3. Web: App.tsx integration and key routing

- `App.tsx`: call `useTranscriptSearch`, pass `current.bufferLines` and active tab label. In `onSubmit`: intercept `search transcript <pattern>` before `runCommand` — if matches found, call `search.open(pattern)` and return; if no matches, fall through to `runCommand`. In the window keydown handler: add Cmd+F branch (after history picker guard, before scroll keys); while search is open, skip scroll-key handling. Conditional render: `{searchOpen ? <SearchBar .../> : <CommandInput .../>}`. Pass `highlight` prop to `<Transcript>` derived from hook state.
- `App.tsx` line budget: the hook extraction keeps state out, but the Cmd+F branch, conditional render, and highlight pass-through add ~10-15 lines. If the file exceeds the `max-lines` limit, extract the `onSubmit` interception logic into a helper function in the same file or a new `web/src/command-interceptions.ts`.

### 4. Web: highlight rendering and scroll integration

- `web/src/transcript-line.tsx`: `renderLine` gains optional `highlight` parameter. For the highlighted line, use `matchRange()` from `@shared/search-matches` to split text and wrap in `<span className="search-hit">`. Markdown fallback: apply `search-hit` class to the whole block.
- `web/src/Transcript.tsx`: `Properties` gains optional `highlight` prop. When set, disable stick-to-bottom pinning (`stick.current = false`). Add `useEffect` to scroll the highlighted line (found via `data-search-hit` attribute) into view near the bottom. Pass `highlight` through to `renderLine`.
- `web/src/transcript-line.test.tsx`: extend — `search-hit` span wraps only the matched substring on the current match line; markdown fallback applies the class to the whole block.
- `web/src/theme.css`: `.search-bar`, `.search-result` classes; `.search-hit` background color for both themes.

## Tests

- `src/search-matches.test.ts` — match ordering (most recent first stepping older), empty pattern, invalid regex, case-insensitivity, match-range extraction for substring highlighting, skipped line types.
- `src/commands/search.test.ts` — match regex on the command, no-match appends the report line, non-interactive match reports the most recent matching line, invalid pattern output.
- `web/src/SearchBar.test.tsx` — renders result line + input, focus on open, live update on edit, ArrowUp/Down stepping, Enter is a no-op, Escape closes and refocuses the command input, no result shown for empty pattern.
- `web/src/transcript-line.test.tsx` — extend: `search-hit` span wraps only the matched substring on the current match line; markdown fallback applies the class to the whole block.
- `App` interception test — `search transcript foo` with matches does not send a `command` RPC; with no matches it does.

## Out of scope

- Multi-flag regex syntax (e.g. `search transcript /pattern/g`) — case-insensitive only for now.
- Searching across multiple tabs — current tab only.
- Searching view tabs (image, page, harness, markdown, editor) or monitor tabs — transcript-body tabs only.
- Persistent search history — the pattern is ephemeral per session.
- Search-and-replace — search only.
- Highlighting all matches simultaneously — only the current match is highlighted.

## Verification

`./scripts/run.mjs check-diff` after each step. End-to-end: start the app, type `search transcript error` in a tab with transcript output — search bar appears with the pattern pre-filled, the most recent matching line is highlighted and scrolled into view; ArrowUp/ArrowDown navigates between matches; edit the pattern — matches update live; type an invalid regex (e.g. `[`) — "Invalid pattern" shown in result line; Escape — search bar closes, command bar returns with focus, highlight removed; `search transcript zzzzznotfound` — "No matches found in the transcript." appears as a command output line; Cmd+F — search bar opens with empty pattern; switch tabs while search is open — search mode closes; `help` — lists `search transcript`.
