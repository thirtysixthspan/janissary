# Restyle the in-editor suggestion pill as a notification-style badge and add Tab/Enter keyboard focus

**Complexity: 4/10** — a CSS restyle of one existing element, one new piece of hook state, and a
small addition to the existing keydown-interception pipeline. No new files, no protocol or data
model changes, no new architecture.

## Goal

Per the backlog entry: the in-editor persona-suggestion pill (`product/specs/editor-tab.md:245`)
should look like the "dark text on colored background" badge already used elsewhere to denote an
agent, should sit right-aligned on its line, and should be operable from the keyboard — Tab moves
keyboard focus to the pill (highlighting it) and Enter, while it holds focus, sends the request
(the same action `[run]`'s click or Ctrl/Cmd+Enter already trigger).

## Approach

**Visual style.** The closest existing "notification to denote the agent" badge is
`.line.message .message-tab` (`web/src/theme.css:378-381`), the per-agent chip shown on a
cross-tab message notification: `background: var(--from-color, var(--muted)); color: var(--bg);
border-radius: 10px; padding: 0 8px; font-size: 0.85em; line-height: 1.6;` — a colored background
with `--bg`-colored (dark, on the default dark theme) text. `.editor-suggest-pill-run`
(`web/src/theme.css:644-646`) already partially matches this (`background: var(--accent); color:
var(--bg);`) but isn't rounded, and the base `.editor-suggest-pill` class used by every
non-runnable state (`[agent?]`, `[query?]`, `[running...]`, `[no suggestion]`) currently has no
background at all — just faint text. Bring the base class in line with `.message-tab`'s shape
(rounded pill, `0 8px` padding, `0.85em`/`1.6` type sizing) and give it a colored background
(`var(--muted)`) with `--bg` text, so every pill state reads as the same family of badge; the
runnable state keeps its `--accent` background (unchanged) and stays the only clickable variant.

**Right-floated placement.** `.editor-row` is already `display: flex` and `.editor-content` is
already `flex: 1` (i.e. `flex-grow: 1; flex-shrink: 1; flex-basis: 0%` — the standard "fill the
remaining space" idiom), so the pill, as the next flex sibling with no grow of its own, already
renders flush against the row's right edge. No layout change is needed for this to be true today;
add an explicit `margin-left: auto` to `.editor-suggest-pill` anyway so the right-alignment is
encoded in the pill's own rule rather than depending on `.editor-content`'s flex-basis staying put.

**Keyboard focus.** The editor has no per-element DOM focus model — every keystroke lands on one
hidden `<textarea>` (`web/src/EditorTab.tsx`'s `textareaRef`) and is routed through
`handleSuggestKeyDown` before the normal key-action pipeline. Pill "focus" is therefore modeled as
state, the same way `pending`/`firingLine`/`noSuggestionLine` already are in `useEditorSuggest`,
not as real DOM focus:

- Add `focusedPillLine: number | null` (a line index) to `useEditorSuggest`'s state and
  `EditorSuggestApi`, plus a plain setter `setFocusedPillLine`.
- In `handleSuggestKeyDown`, when `Tab` is pressed and the caret is on a line whose pill is
  currently runnable (checked via the existing `suggestPillLabel` — the same predicate that
  decides whether `[run]` is shown) and no persona-name completion applies at the caret (that
  branch keeps priority, unchanged), set `focusedPillLine` to the current line and prevent the
  default tab-insert.
- When a pill is focused (`focusedPillLine === cursor.line`) and the current key is a plain
  `Enter` (no Ctrl/Cmd — that combination already fires unconditionally and keeps doing so), fire
  the request on that line and clear the focus, preventing the default newline insert.
- Any other key pressed while a pill is focused clears `focusedPillLine` (so typing or navigating
  away silently reverts to normal editing) but is not otherwise intercepted — it falls through to
  the normal pipeline.
- `EditorLines.tsx` already computes `onCursorLine = index === state.cursor.line` per rendered
  line; add `pillFocused = onCursorLine && suggest.focusedPillLine === index` and pass it to
  `EditorLine`, which adds an `editor-suggest-pill-focused` class (a focus ring, `outline: 2px
  solid var(--fg)`) when set. Gating on `onCursorLine` as well as the stored index means a stray
  mouse click that moves the caret elsewhere without a keydown event still visually clears the
  highlight, with no extra wiring needed.

## Implementation steps

1. `web/src/theme.css`: restyle `.editor-suggest-pill` (rounded badge, `var(--muted)` background,
   `var(--bg)` text, `margin-left: auto`) and add `.editor-suggest-pill-focused` (focus outline).
   Leave `.editor-suggest-pill-run` as the accent-colored, clickable variant (unchanged colors).
2. `web/src/editor/useEditorSuggest.ts`: add `focusedPillLine` state and `setFocusedPillLine` to
   the returned `EditorSuggestApi`.
3. `web/src/editor/handleSuggestKeyDown.ts`: add the pill-focus Tab branch and the focused-Enter
   branch described above, importing `suggestPillLabel` from `./suggest-request.ts`.
4. `web/src/editor/EditorLines.tsx`: compute and pass `pillFocused` to `EditorLine`.
5. `web/src/editor/render.tsx`: accept `pillFocused?: boolean` in `LineProps` and add the
   `editor-suggest-pill-focused` class to the pill span when set.

## Tests

- `web/src/editor/handleSuggestKeyDown.test.ts` (new file, mirroring `useEditorSuggest.test.ts`'s
  fake-client style): Tab on a runnable request line sets `focusedPillLine` and prevents default;
  Tab still completes a persona name in priority over focusing the pill when the caret is inside
  an incomplete persona token; Enter while a pill is focused calls `fireOnLine` and clears focus;
  a non-Enter, non-Tab key while a pill is focused clears focus without firing.
- `web/src/editor/render.test.tsx`: add a case asserting the pill span gets
  `editor-suggest-pill-focused` when `pillFocused` is passed, and omits it otherwise.
- Run `./scripts/run.mjs check-diff` after each step.

## Spec updates

- `product/specs/editor-tab.md:210-212` and `:245-251` ("In-editor persona suggestions"): describe
  the pill as a colored badge, and add that pressing Tab on a runnable request line (when the
  caret isn't inside an incomplete persona name) moves keyboard focus to the pill, and that a
  plain Enter while the pill holds focus sends the request the same way Ctrl/Cmd+Enter or a click
  on `[run]` does; any other key clears that focus.

## Docs

- Checked `help.md` — no mention of the pill, Tab, or Enter behavior in the editor. No update
  needed.
- Checked `documentation/user-documentation/` — no page documents the in-editor suggestion pill or
  its keyboard shortcuts. No update needed (out of scope per the task rules — don't add new
  documentation for previously-undocumented behavior).

## Out of scope

- Any other pill state's text/wording, or the underlying suggestion request/accept/decline flow.
- Real DOM focus (`tabIndex`, `role="button"`) on the pill span — the editor's single-hidden-
  textarea keyboard model is unchanged; pill focus stays purely in `useEditorSuggest` state.
- Shift+Tab or any reverse-focus behavior — not requested and no other reverse-tab convention
  exists in the editor to match.
- Clearing pill focus on mouse clicks elsewhere via a dedicated handler — already covered for free
  by gating the visual highlight on `onCursorLine`, so no separate wiring is added.
