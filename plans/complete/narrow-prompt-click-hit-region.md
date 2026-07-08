# Limit the transcript prompt-line click target to the command text

**Complexity: 1/10** — move an existing handler from the outer line `<div>` to the inner command
`<span>`, plus a CSS scope tweak.

## Goal

Double-clicking a previous command in the transcript re-runs it. Today the clickable/double-
clickable region is the entire line — including the leading `cwd` (working-directory) text — when
it should be limited to just the command text itself (the `❯ <command>` portion).

## Background (verified)

- `web/src/transcript-line.tsx` (`renderPromptLine`, non-ACP branch) currently puts
  `onMouseDown`/`onDoubleClick` (and the `title="Double-click to execute this command"` tooltip)
  on the outer `<div className="line prompt">`, which wraps **both** the `<span className="cwd">`
  and the command `<span>`. That means double-clicking the `cwd` text also re-runs the command —
  the exact behavior this issue asks to narrow.
- This is a leftover half of a previously-fixed issue: the single→double-click switch
  (`plans/complete/transcript-prompt-double-click.md`) explicitly listed "narrowing the clickable
  hit region to just the command text" as a separate, out-of-scope item at the time — this fix
  completes that remaining half.
- `web/src/theme.css:145-146` — `.line.prompt { color: var(--accent); cursor: pointer; }` and
  `.line.prompt .cwd { color: var(--faint); margin-right: 6px; }`. The `cursor: pointer` currently
  applies to the whole line (including the `cwd` span), which visually implies the whole line is
  clickable — needs to move to just the command span.
- `web/src/transcript-line.test.tsx`'s existing prompt-click tests
  (`screen.getByText(/git status/)`) target the command text directly already, so they continue to
  pass unchanged with the handler moved inward — `getByText` with a `RegExp` matches whichever
  element's text content matches the pattern, regardless of nesting depth.

## Approach

Move `onMouseDown`/`onDoubleClick`/`title` from the outer `<div>` onto the command `<span>` (give
it a `prompt-text` class to hook the CSS), leaving the `cwd` span and the outer div (still
carrying `hitProps` for search-hit highlighting) untouched by the click handlers.

## Implementation

1. **`web/src/transcript-line.tsx`** (`renderPromptLine`, non-ACP branch) — restructure:
   ```tsx
   return (
     <div key={index} className="line prompt" {...hitProps}>
       {line.cwd && <span className="cwd">{line.cwd}</span>}
       <span
         className="prompt-text"
         title="Double-click to execute this command"
         onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }}
         onDoubleClick={() => {
           const selection = globalThis.getSelection()?.toString();
           if (selection) return;
           onPromptClick(line.text);
         }}
       >
         {'❯'} {highlightText(line.text, highlight, index)}
       </span>
     </div>
   );
   ```
2. **`web/src/theme.css:145`** — remove `cursor: pointer` from `.line.prompt`, add a new rule
   `.line.prompt .prompt-text { cursor: pointer; }` so only the command text shows the pointer
   affordance.

## Tests

Added to `web/src/transcript-line.test.tsx`, `describe('renderLine — prompt click', ...)`:

- `'does not call onPromptClick when the cwd text is double-clicked, only the command text'` —
  double-clicks the `cwd` span's text directly and asserts `onPromptClick` was not called, plus
  confirms the `.cwd` element does not carry the new `prompt-text` class (a direct check that the
  handler didn't leak onto it).

Existing tests (double-click re-runs the command, ACP single-click collapses, selection guard)
are unaffected and continue to pass, verified via `./scripts/run.mjs check-diff`.

## Verification

`./scripts/run.mjs check-diff` passes clean. Manual: run the app, run a command so a prompt line
with a `cwd` prefix appears, double-click the `cwd` text and confirm nothing happens, then
double-click the command text itself and confirm it re-runs. Not runnable in this environment —
note as unverified manually if so.

## Out of scope

- The double-click gesture itself, the selection guard, and the `onMouseDown` native-selection
  workaround — all already correct and unchanged, just relocated to the narrower element.
- The ACP prompt line's collapse-on-click behavior (still on the whole line, unaffected — that
  issue never asked for narrowing).
