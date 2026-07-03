# Transcript search

Search the current tab's transcript with a regex, from a search bar that temporarily replaces the command bar.

## Behavior

- `search transcript <regex_pattern>` typed in the command bar enters search mode in the current tab with that pattern pre-filled.
- Cmd+F also enters search mode, with an empty pattern (suppress the browser's native find). Mac-only: no Ctrl+F alias.
- Matching is case-insensitive.
- In search mode the command bar turns into a search bar with two parts: a result line and a pattern input.
- The pattern input has keyboard focus and stays editable; the search re-runs live on every edit.
- The result line shows the current match — initially the most recent (bottom-most) matching transcript line.
- With an empty pattern no search runs and no result is shown.
- Within the current matching line, only the matched text (not the whole line) is highlighted with a background color.
- The transcript scrolls so the matching line sits just above the search bar with ~2 lines of context visible above and below it.
- ArrowUp moves to a less recent (older) match; ArrowDown moves back toward more recent matches. Each step updates the result line, the highlight, and the scroll position.
- Escape exits search mode: the search bar is replaced by the command bar again, focus returns to the command input, the highlight is removed.
- If `search transcript <pattern>` finds no matches, search mode is not entered; instead "No matches found in the transcript." is reported as a normal command output line in the transcript.

## Design

Search is a **client-side UI mode**, like the history picker (`hist` / Ctrl+R). The client already holds the full flattened transcript (`TabView.bufferLines` from `src/protocol.ts`), so matching, highlighting, and scrolling all happen in the web client with no new RPCs.

### Entry points

1. **Command**: intercept `search transcript <pattern>` in `App.tsx`'s `onSubmit`, alongside the existing `hist` / `quit` interceptions (`web/src/App.tsx:209-215`). Run the regex against the current tab's `bufferLines`:
   - matches found → enter search mode with the pattern pre-filled and the most recent match current; do not send the command to the server.
   - no matches → forward the command to the server, whose `search` command module appends the "No matches found in the transcript." output line (see server section below).
2. **Cmd+F** (`e.metaKey && e.key === 'f'`): handled in the window keydown handler in `App.tsx`, with `preventDefault()` to suppress the browser find dialog. Mac-only — no Ctrl+F binding. Only active when the current tab shows the transcript body (not view tabs — image/page/harness/markdown/editor/monitor — and not while `activePty` is set). Opens search mode with an empty pattern.

### Client state and components

New hook `web/src/useTranscriptSearch.ts` owning the mode state, kept out of `App.tsx` (which is already near the 200-line `max-lines` limit):

- `searchOpen: boolean`, `pattern: string`, `matchIndex: number` (0 = most recent match, counting backward through the matches list).
- Matches are derived (memoized) from `(lines, pattern)`: the list of `bufferLines` indices whose `text` matches the regex, compiled case-insensitive (`i` flag). Recomputed when new transcript lines arrive; `matchIndex` is clamped so a live tab doesn't crash the mode.
- Invalid regex (`new RegExp` throws) → treated as "no search": no matches, result line shows an "invalid pattern" note instead of a match.
- Exposes `open(pattern)`, `close()`, `setPattern`, `stepOlder()` / `stepNewer()`, and the derived `currentLineIndex` for the transcript.

New pure helper module `web/src/search-matches.ts` (`findMatches(lines, pattern)` + safe regex compile) with unit tests — keeps the hook thin and the matching logic testable without DOM.

New component `web/src/SearchBar.tsx`, rendered in place of `<CommandInput>` when `searchOpen`:

- Result line above the input: the current match's text plus a position indicator (e.g. `3/17`), or "No matches" / "Invalid pattern" states; nothing when the pattern is empty.
- Pattern input with `autoFocus`; `onChange` re-runs the search (current match resets to the most recent).
- Key handling on the input (stop propagation so the window handler and `useTranscriptScroll` never see these keys):
  - `ArrowUp` → older match, `ArrowDown` → newer match
  - `Escape` → close search mode, refocus the command input
  - `Enter` → no-op (decided)
- Styling in `web/src/theme.css`: reuse the `.command-area` layout; new `.search-bar`, `.search-result` classes so it visually reads as the command bar transformed.

### Highlight and scroll

- Only the matched text is highlighted, and only on the current match line (not every match in the transcript).
- `Transcript.tsx` gains an optional `highlight` prop: `{ lineIndex: number; pattern: string }`. For the line at `lineIndex`, `renderLine` (`web/src/transcript-line.tsx`) splits `line.text` around the first regex match and wraps the matched range in `<span className="search-hit">`; `.search-hit` gets a background color in `theme.css` (both themes). A small pure helper (in `search-matches.ts`) returns the match range so the splitting logic is shared and testable.
- Markdown lines render sanitized HTML via `dangerouslySetInnerHTML`, so substring wrapping can't be injected safely there; as a fallback, a matched markdown block gets the `search-hit` class on the whole block. Prompt/output/message/collapsed lines get true substring highlighting.
- While search mode is open with a current match, `Transcript` disables its stick-to-bottom pinning (the `stick` ref) and instead scrolls the highlighted line into view positioned near the bottom of the viewport: target `scrollTop` so the match sits ~2 line-heights above the bottom edge (match ± 2 context lines visible just above the search bar). Use a ref/`data-` attribute on the highlighted line element and compute from `offsetTop`; re-run the effect when the highlight target changes or lines change.
- On close, restore normal behavior (re-enable pinning; leave the scroll where it is — Escape in the transcript already offers jump-to-bottom).

### Key-routing order in `App.tsx`

The window keydown handler must check search mode **before** `handleScrollKey`, because `useTranscriptScroll` currently swallows `Escape` (jump to bottom) and Shift/Ctrl+Arrow. Since the search input stops propagation for the keys it owns, the window handler mostly needs: Cmd+F to open, and to ignore scroll-key handling collisions while the mode is open. The existing route-chooser and history-picker guards stay ahead of everything, as today.

### Server side

- New `src/commands/search.ts` module (registered in `src/commands/index.ts`, added to `availableCommands` in `src/commands.ts` and the README command docs that `help` renders from):
  - `match`: `/^search\s+transcript\b/i`
  - `run`: re-run the same regex over the tab's flattened buffer text; when nothing matches, `managers.tab.append(label, { input, output: 'No matches found in the transcript.' })` (the pattern `rename.ts` uses). When something does match (reached non-interactively, e.g. a scheduled dispatch), report the most recent matching line as output instead of opening any UI — the interactive path never reaches the server in that case.
  - Missing/invalid pattern → usage/`Invalid pattern` output line.
- The interactive client remains the source of truth for entering the mode; the server module exists so the command is a real built-in (help, completion, non-interactive dispatch, and the no-match report all work).
- Completion: `search` gets command-name completion for free once it's in `availableCommands`; optionally add a tiny handler offering the `transcript` subcommand token (pattern: `completion-handlers.ts`).

## Notes and edge cases

- **Regex safety**: the pattern is user input compiled with `new RegExp`. Wrap in try/catch (invalid pattern state). Keep the ESLint `security/detect-unsafe-regex` rule in mind — it lints literal regexes in our code, not runtime input, but a catastrophic user pattern only blocks the user's own client; no server exposure since the server only runs it via the same guarded compile helper if shared.
- **Shared matcher**: `@shared` aliases to `src/`, so the pure matcher could live server-side and be imported by the web client. Decide during implementation whether sharing one helper beats two ~10-line copies (client operates on `BufferLine[]`, server on flattened lines — shapes align).
- **Live tabs**: new output while searching shifts nothing (matches are keyed by recomputation, and pinning is disabled), but the "most recent match" can change under the user; clamping `matchIndex` and re-anchoring on pattern edits keeps behavior predictable.
- **Line granularity**: matching is per `BufferLine` against `line.text`. Markdown/terminal-card lines: terminal cards have no meaningful `text` — skip `type: 'terminal'` and `type: 'spacer'` lines; markdown blocks match on their raw text.
- **Which tabs**: search mode only exists on transcript-body tabs. Switching tabs while search is open closes the mode.

## Testing

- `web/src/search-matches.test.ts`: match ordering (most recent first stepping older), empty pattern, invalid regex, case-insensitivity, match-range extraction for substring highlighting, skipped line types.
- `web/src/SearchBar.test.tsx`: renders result line + input, focus on open, live update on edit, ArrowUp/Down stepping, Enter is a no-op, Escape closes and refocuses the command input, no result shown for empty pattern.
- `Transcript` highlight test (extend `transcript-line.test.tsx`): `search-hit` span wraps only the matched substring on the current match line; markdown fallback applies the class to the whole block.
- `src/commands/search.test.ts`: match regex on the command, no-match appends the report line, non-interactive match reports the most recent matching line, invalid pattern output.
- `App` interception: `search transcript foo` with matches does not send a `command` RPC; with no matches it does.

## Decisions

- Mac-only: Cmd+F is the sole keybinding; no Ctrl+F alias for other platforms.
- Matching is case-insensitive (`i` flag); no flag syntax for now.
- Enter in the search input is a no-op.
- Highlight only the matched substring (whole-block fallback for markdown lines, where the sanitized HTML can't be safely re-split).
