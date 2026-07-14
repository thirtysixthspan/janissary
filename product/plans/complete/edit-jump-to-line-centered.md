# Scroll to the target line, centered, when jumping from a file:linenumber link

**Complexity: 5/10** — no new architecture, but the line number is threaded end-to-end
(link parsing → command text → server open path → protocol type → initial editor cursor →
scroll alignment); about eight files touched across server and web.

## Goal

Clicking a `file:linenumber` link in the transcript (e.g. `src/foo.ts:42`) opens the file in
the in-app editor with line 42 scrolled to the middle of the viewport. Today the line number
is parsed out of the link but silently dropped before the `edit` command runs, so every jump
lands the cursor at line 1 with no scrolling at all.

## Background

- `web/src/file-link.ts` `fileLineSegments()` already parses `path:line` links into
  `{ type: 'link', path, line }` segments, but `renderFileLinkSegments()` (line 119) builds
  the click command as `edit ${seg.path}` — the parsed `line` is discarded.
- `web/src/transcript-line.tsx` (lines 69-75) has the same bug for `file:line` links rendered
  inside Markdown: it strips the line number back off the href before sending the `edit`
  command.
- `src/commands/edit.ts` `run()` only ever treats its whole argument as a file path; it has no
  syntax for a trailing line number.
- `src/open-file-manager.ts` `edit()` and `src/openers/editor.ts` `openInEditor()` resolve and
  open the file but take no line parameter.
- `src/types.ts` `EditorView` (lines 88-93) has no `line` field to carry a target line to the
  client.
- `web/src/EditorTab.tsx` loads every file with the cursor at `{ line: 0, col: 0 }`
  (`web/src/editor/model.ts` `fromText`) and the only scroll effect (line 62) always uses
  `scrollIntoView({ block: 'nearest' })` — there is no "center on jump" behavior to reuse.
- Each `edit` invocation always creates a brand-new editor tab (`addEditorTab` in
  `src/tab-creators.ts` picks a fresh unique label), so an `EditorTab` component instance is
  never reused across two different jumps to the same file — a ref-based "have we done the
  initial scroll yet" flag is safe to add without stale-state concerns.

## Approach

Thread the target line as a plain 1-based number from the parsed link, through the `edit`
command text (`edit path:line`), through the server-side open path, into `EditorView.line`,
and use it once on initial load in `EditorTab` to place the cursor and scroll it to the
center of the viewport. Normal typing/cursor-movement scrolling keeps its existing `'nearest'`
behavior — only the initial jump centers.

## Implementation steps

1. **`web/src/file-link.ts`** — in `renderFileLinkSegments`, build the file command as
   `` `edit ${seg.path}:${seg.line}` `` instead of dropping the line.
2. **`web/src/transcript-line.tsx`** — simplify the markdown link handler: since the anchor's
   `href` for a file link is already the full `path:line` match (from `linkifyMarkdown`), stop
   stripping the line back off — send `` `edit ${url}` `` directly for file links (remove the
   now-dead `colon`/`path` slicing).
3. **`src/commands/edit.ts`** — parse an optional trailing `:<digits>` off `target` before
   passing it on: extract `path` and `line` (`number | undefined`), pass both to
   `managers.openFile.edit`.
4. **`src/open-file-manager.ts`** — add an optional `line?: number` parameter to `edit()`,
   forward it to `openInEditor`.
5. **`src/openers/editor.ts`** — add an optional `line?: number` parameter to `openInEditor`,
   include it as `line` in the `context.openEditorTab({...})` payload when provided.
6. **`src/types.ts`** — add `line?: number` to `EditorView`.
7. **`web/src/editor/model.ts`** — give `fromText` an optional second `line?: number`
   parameter (0-based internal cursor line, clamped with the existing `clampNumber` helper —
   move its declaration above `fromText`); when provided, set the initial cursor to
   `{ line: clamped, col: 0 }` instead of `{ line: 0, col: 0 }`.
8. **`web/src/editor/useEditor.ts`** — give `EditorApi.load` an optional `line?: number`
   parameter and forward it to `fromText`.
9. **`web/src/EditorTab.tsx`** —
   - In the load effect, call `api.load(text, editor.line !== undefined ? editor.line - 1 : undefined)` (convert the 1-based protocol line to a 0-based cursor line).
   - Replace the single scroll effect with one that centers only the first time the document
     becomes available and `editor.line` was set, then falls back to `'nearest'` for every
     subsequent cursor change (track "first scroll done" with a `useRef`).

## Tests

- `web/src/file-link.test.tsx` — update the existing "sends an edit command when a file:line
  link is clicked" expectation to `'edit src/foo.ts:42'`; add a case confirming a plain
  (non-link) segment is unaffected.
- `web/src/transcript-line.test.tsx` — update "sends an edit command when a file:line link is
  clicked in markdown" to expect `'edit src/foo.ts:42'`.
- `src/commands/edit.test.ts` — add cases: `edit src/foo.ts:42` calls
  `managers.openFile.edit` with `target: 'src/foo.ts'` and `line: 42`; `edit src/foo.ts` (no
  line) calls it with `line: undefined`.
- `src/open-file-manager.test.ts` — add a case asserting `edit(..., line)` forwards the line
  through to the `openEditorTab` view.
- `src/openers/editor.test.ts` — add a case asserting `openInEditor(file, ctx, line)` includes
  `line` in the opened view, and that omitting it leaves `line` undefined.
- `web/src/editor/model.test.ts` — add cases for `fromText(text, line)`: places the cursor on
  the given (0-based) line, and clamps an out-of-range line to the last line.
- `web/src/EditorTab.test.tsx` — add a case: rendering with `editor={makeView({ line: 2 })}`
  (1-based, so cursor lands on 0-based line 1) scrolls the caret with
  `{ block: 'center' }` on load, while the existing "scrolls the caret into view when the
  cursor moves" test (typing after load, no `line` set) continues to assert `'nearest'`.

## Out of scope

- Parsing/using the `:col` component of `file:line:col` links (only `:line` is threaded).
- Centering on every cursor move — only the initial jump from a link centers; typing and
  keyboard navigation keep `'nearest'`.
- The `open <file>:<line>` command (only `edit` gains line-jump support, matching how file
  links already choose `edit` over `open`).

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: in a transcript line containing
`src/foo.ts:42`, click the link — the editor tab should open with the cursor on line 42,
scrolled to the middle of the viewport.
