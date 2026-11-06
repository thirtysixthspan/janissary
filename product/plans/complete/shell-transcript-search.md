# Search a shell tab's transcript with the editor's find dialog

**Complexity: 4/10** — the find dialog and its state already exist in the editor tab; this promotes them to a shared module, publishes them on the client plugin API, and points a second caller at the shell terminal's buffer. The new logic is small: reading the xterm buffer as logical lines (wrapped rows joined), revealing a chosen line, a `meta+f` chord claim, and a client-side intercept for `search transcript <pattern>`. No server or wire changes.

The backlog entry: "in the shell tab, implement transcript search using the editor search dialog and user interactions. trigger it with the command `search transcript <pattern>` or cmd+f."

Today `Cmd+F` does nothing in a shell tab, and `search transcript <pattern>` typed in a shell's command bar goes to the server's command, which searches only the application replies Janissary keeps for the tab and prints the most recent matching line. Neither searches what the terminal actually shows.

## Goal

In a shell tab, `Cmd+F` opens the editor's find overlay (the same input, ranked rows with line numbers and highlighted matches, the same Up/Down/Enter/Escape keys) over the shell's terminal transcript. `search transcript <pattern>` typed in the shell's command bar opens the same overlay with the pattern already entered. Highlighting a result scrolls the terminal so that line is in view and selects it. Escape closes the overlay and returns focus to the command bar.

## Approach

1. **Promote the editor's find overlay to shared.** Move `web/src/editor/EditorFind.tsx` to `web/src/shared/line-find/LineFind.tsx` (component `LineFind`, with a `placeholder` prop; the editor passes `Search buffer`) and `web/src/editor/useEditorFind.ts` to `web/src/shared/line-find/useLineFind.ts` (hook `useLineFind`, type `LineFindApi`). `open` takes an optional initial query. Move their tests alongside. The editor imports the shared versions; its behavior is unchanged. CSS class names stay as they are (`editor-find…` in `theme.css`), so both tabs render identically.
2. **Publish them to plugins.** Export `LineFind` and `useLineFind` from `web/src/plugins/api.ts`, the only module a client tab plugin may import.
3. **Read the terminal as lines.** New pure module `web/src/plugins/shell/transcript-lines.ts`: `readTranscriptLines(buffer)` walks the xterm active buffer, joins wrapped rows into one logical line, trims trailing whitespace, and returns `{ lines, rows }` (each line's first buffer row). `revealTranscriptRow(terminal, row)` scrolls so the row sits a quarter of the way down the viewport and selects it.
4. **Expose those on the shell terminal handle.** `useShellTerminal` gains `transcript()` and `revealRow(row)`. That pushes the hook past the 200-line limit, so its read-only handle methods (focus, selection, scrolling, rows, and the two new ones) move to a new `useShellTerminalView.ts` hook it composes.
5. **Shell find state.** New hook `web/src/plugins/shell/useShellTranscriptFind.ts`: snapshots the transcript when the overlay opens, runs `useLineFind` over it, and offers `open(query?)`, `select(row)` (sets the selection and reveals the row), and `close()`.
6. **Triggers.**
   - Add `meta+f` to the shell manifest's `chords`; the chord handler in `ShellTab` opens the find overlay for `meta+f`, keeps `meta+t` opening a sibling shell, and every other claimed chord still toggles history. A `FIND_CHORD` constant joins `NEW_SHELL_CHORD`.
   - `transcriptSearchQuery(text)` in `command-line-rules.ts` answers the pattern for `search transcript …` (case-insensitive, `undefined` for any other line). `useShellSubmit` intercepts it before dispatch, records the line in history, discards any queue receipt, and opens the overlay with the pattern.
7. **Render.** `ShellTab` renders `LineFind` with placeholder `Search transcript` when open; closing returns focus to the command bar. The bar's key handler yields while the overlay is open.

## Implementation steps

1. Move the editor find component and hook to `web/src/shared/line-find/`, rename, add `placeholder` and `open(initialQuery)`, move tests, update the editor imports.
2. Export `LineFind` and `useLineFind` from `web/src/plugins/api.ts`.
3. Add `transcript-lines.ts` and expose `transcript()`/`revealRow()` from `useShellTerminal`.
4. Add `useShellTranscriptFind.ts`, `transcriptSearchQuery`, the `meta+f` claim and constant, the submit intercept, and the overlay render in `ShellTab`.
5. Update specs and docs.

## Tests

- `web/src/shared/line-find/useLineFind.test.ts` (moved): existing cases, plus `open('fox')` starts with that query and its results.
- `web/src/shared/line-find/LineFind.test.tsx` (moved): existing cases, plus the placeholder prop.
- `web/src/plugins/shell/transcript-lines.test.ts`: wrapped rows join into one line with the first row recorded; trailing whitespace trimmed; `revealTranscriptRow` scrolls and selects the row.
- `web/src/plugins/shell/command-line-rules.test.ts`: `transcriptSearchQuery` returns the pattern, an empty string for a bare `search transcript`, and `undefined` for `search foo` or `searching transcript`.
- `web/src/plugins/shell/ShellTab.test.tsx`: `search transcript <pattern>` opens the overlay with the pattern and does not dispatch; the claimed `meta+f` opens an empty overlay; highlighting a match scrolls and selects its row; Escape closes it and refocuses the bar. The stub terminal gains buffer rows, `scrollToLine`, and `selectLines`, and its default claimed chords include `meta+f`.
- `src/plugins/declaration-validation.test.ts`: the pinned shell manifest chord list includes `meta+f`.

## Specs and docs

- `product/specs/shell-tab.md`: replace "`Cmd+F` does nothing here" with a Transcript search section.
- `product/specs/keyboard-navigation.md`: the Cmd+F note names the shell transcript too.
- `help/keys.md`: the shell tab's `Cmd+F` row.
- `help/search.md`: note that in a shell tab the transcript form opens the find overlay.
- `documentation/user-documentation/command-bar/transcript-search.md`, `command-bar/shell.md`, `getting-started/keyboard.md`, `tab-types/editor.md`: correct the statements that `Cmd+F` does nothing in a shell tab. The transcript search page is retitled `Search a transcript`, matching its sidebar entry.

## Out of scope

- Regular-expression matching in the shell overlay — it uses the editor's substring matcher, the same as `Cmd+F` in an editor.
- Live updating of results as the terminal prints more output while the overlay is open; the snapshot is taken when it opens.
- Text drawn into the terminal as a rendered Markdown block (an overlay element, not buffer text) is not searchable.
- `search transcript` in other tab types, and the server's `search` command, are unchanged.
