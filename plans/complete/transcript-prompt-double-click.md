# Require a double click to re-run a transcript command

**Complexity: 1/10** — swap one event handler in `transcript-line.tsx`, update its `title`, and
adjust the three existing click tests to double-click.

## Goal

Clicking a previous command line in the transcript currently re-runs it on a single click. That
is too easy to trigger by accident (e.g. while trying to select text). Require a double click
instead.

## Background (verified)

- `web/src/transcript-line.tsx:118-127` (`renderPromptLine`, non-ACP branch) — the outer
  `<div className="line prompt">` has `onClick={() => { ...; onPromptClick(line.text); }}`, with
  a guard that skips the call when the user has an active text selection (so click-to-select
  still works via that escape hatch, but a plain click still re-runs the command). The `title`
  attribute reads `"Click to execute this command"`.
- The ACP prompt branch (`transcript-line.tsx:111-116`, `onClick={onToggleCollapse}`, `title="Click
  or Ctrl+T to collapse"`) is a **different** interaction (collapsing an agent step) and is out of
  scope — this fix only touches the plain (non-ACP) prompt branch.
- Project convention for single vs. double click is just native React `onClick`/`onDoubleClick`
  on the same element, no shared hook — e.g. `FileTreeTab.tsx:157`
  (`onDoubleClick={(e) => onRowDoubleClick(row, e.shiftKey)}`, single click only selects) and
  `TabItem.tsx:54` (`onDoubleClick` triggers rename, single click still selects via the parent).
- Tests: `web/src/transcript-line.test.tsx:26-54` (`describe('renderLine — prompt click', ...)`)
  — three tests using `userEvent.click`: re-run on click, ACP-collapse-not-run on click, and
  selection guard. The first and third need to switch to `userEvent.dblClick`; the ACP one is
  unaffected (still single click).
- `web/src/theme.css:145` (`.line.prompt { color: var(--accent); cursor: pointer; }`) needs no
  change — `cursor: pointer` still reads fine as a double-click affordance.
- `specs/transcript.md` does not currently document click-to-execute behavior for prompt lines at
  all — this fix adds that documentation.
- **Out of scope:** `plans/small-issues.md` also separately lists "the clickable window extends
  the entire line, when instead the clickable window should be limited to the text of the command
  itself" (narrowing the hit region to just the command `<span>`, excluding the `cwd` span). That
  is a distinct listed issue and is **not** touched by this fix — only the single→double click
  switch is in scope here.

## Approach

Rename the handler prop from `onClick` to `onDoubleClick` on the non-ACP prompt `<div>`, keeping
the same selection guard and callback. Update the `title` text to reflect double-click.

Naive swap alone breaks the selection guard: browsers (and `@testing-library/user-event@14`'s
`dblClick`, which simulates this) natively select the double-clicked word as part of a double
click, *before* the `dblclick` event fires. That auto-selected word then trips the existing
`getSelection()`-based guard, silently swallowing every double click. Fix by preventing that
native word-selection specifically on the second click — `onMouseDown={(e) => { if (e.detail > 1)
e.preventDefault(); }}` — a standard technique (checking `event.detail`, which counts
consecutive clicks) that leaves ordinary single-click text-selection dragging untouched.

## Implementation

1. **`web/src/transcript-line.tsx:118-127`** — change the non-ACP prompt `<div>` from
   ```tsx
   <div key={index} className="line prompt" title="Click to execute this command" onClick={() => {
     const selection = globalThis.getSelection()?.toString();
     if (selection) return;
     onPromptClick(line.text);
   }} {...hitProps}>
   ```
   to
   ```tsx
   <div
     key={index}
     className="line prompt"
     title="Double-click to execute this command"
     onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }}
     onDoubleClick={() => {
       const selection = globalThis.getSelection()?.toString();
       if (selection) return;
       onPromptClick(line.text);
     }}
     {...hitProps}
   >
   ```
   (the selection guard and `onPromptClick(line.text)` call are otherwise unchanged.)

## Tests

Update `web/src/transcript-line.test.tsx`:

1. `'calls onPromptClick with the line text when a plain prompt is clicked'` (line 27) — rename
   to `'... when a plain prompt is double-clicked'` and switch `userEvent.click` to
   `userEvent.dblClick`.
2. `'does not call onPromptClick when text is selected'` (line 45) — switch `userEvent.click` to
   `userEvent.dblClick` (a real double-click while text is selected should still be suppressed).
3. `'calls onToggleCollapse and not onPromptClick when an ACP prompt is clicked'` (line 35) —
   unchanged; the ACP branch still uses `onClick`.

## Verification

Manual: run the web app, click once on a previous command line in the transcript and confirm it
does **not** re-run; double-click it and confirm it does. Not runnable in this environment — note
as unverified manually if so.

## Out of scope

- Narrowing the clickable hit region to just the command text (separate small-issue, listed
  independently in `plans/small-issues.md`).
- The ACP prompt line's collapse-on-click behavior.
- Any change to file-link click behavior in Markdown output (`renderMarkdownLine`).
