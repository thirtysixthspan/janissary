# Let ArrowUp/ArrowDown move within a wrapped command-bar line before recalling history

**Complexity: 6/10** — one new small measurement module, a signature change threaded through two existing pure functions and their one caller, and jsdom-safe tests that stub the new measurement rather than relying on real layout.

## Goal

In the command bar (`web/src/shared/command-bar/`), `ArrowUp`/`ArrowDown` currently decide whether to move the caret or recall command history purely by looking for `\n` characters in the value (`command-caret-lines.ts`). That is correct only when a line breaks by an explicit `Shift+Enter` newline. The textarea itself word-wraps normally (`web/src/theme.css:545-554`, no `white-space: nowrap`), so a single long message — the common case, no `Shift+Enter` involved — routinely renders as two or more visual rows with no `\n` in the value at all. Today, pressing `ArrowUp`/`ArrowDown` anywhere in such a wrapped value is treated as "on the edge" and immediately recalls history, discarding the in-progress draft instead of moving the caret up or down a visual row first — exactly the bug reported: "up and down are bound to navigating the history of commands" for a multi-line (wrapped) input, when the expected order is line-navigation-within-the-input first, history-recall only once the true first/last line is reached.

After this fix, `ArrowUp`/`ArrowDown` recall history only when the caret is on the textarea's true first/last **visual** row — accounting for wrapping, not just literal `\n` boundaries — in both the conversation tab and agent tabs (both consume the same shared hook).

## Approach

A `\n`-delimited line can only wrap within itself — one explicit line can never share a visual row with another. So the existing `\n` scan in `command-caret-lines.ts` still correctly rules out interior explicit lines (a caret with an explicit line above/below it is never on the visual first/last row, no measurement needed). The only gap is: when the caret's explicit line *is* the first (or last) one, is it also the first (or last) **visual row** of that explicit line, or did the line wrap above (or below) the caret first?

Answering that needs one real measurement: does the substring from the start of the explicit line to the caret (for "first"), or from the caret to the end of the explicit line (for "last"), render wider than the textarea's content box? If its raw, unwrapped width already exceeds the available row width, the browser is guaranteed to have wrapped it onto an additional row — regardless of exactly where word-wrap breaks it, since wrapped rendering can never be wider than the raw unwrapped text. So a simple width comparison is sufficient and exact for the boolean we need (no word-wrap simulation, no DOM mirror element).

The textarea's font is monospace (`--mono`, `web/src/theme.css:550`), but the comparison doesn't even need that — `CanvasRenderingContext2D.measureText` gives an exact pixel width for arbitrary text in a given CSS font, which is what real browsers already use internally. `web/src/plugins/image/edit-render.ts` already establishes the convention of a throwaway `document.createElement('canvas').getContext('2d')` for one-off measurement/drawing work in `web/src/`, and its test (`edit-render.test.ts`) already establishes the project's pattern for stubbing `HTMLCanvasElement.prototype.getContext` in jsdom (where it returns `null` unless mocked). This fix follows both conventions.

`isCaretOnFirstLine`/`isCaretOnLastLine` gain an optional third `element` parameter. Passing no element (or running where `getContext('2d')` is unavailable, e.g. an un-mocked jsdom test) preserves exactly today's `\n`-only behavior — no existing test changes. `useCommandBarKeys.ts` passes `inputRef.current` as the new element argument at its two call sites, so both real callers (agent tabs and the conversation tab) get the fix automatically since they already share this one hook.

## Implementation steps

1. **New file `web/src/shared/command-bar/caret-row-width.ts`.** Export `wrapsWithinRow(element: HTMLTextAreaElement, text: string): boolean` — measures `text`'s raw width in the element's computed font via a cached canvas 2D context (module-level singleton, created lazily) and returns whether that width exceeds `element.clientWidth`. Returns `false` (assume no wrap) whenever `getContext('2d')` returns `null`, mirroring `edit-render.ts`'s `context?.` handling for an unavailable context. No DOM writes, no mirror element — `clientWidth` and `getComputedStyle` are the only reads.

2. **`web/src/shared/command-bar/command-caret-lines.ts`: thread the element through.**
   - `isCaretOnFirstLine(value, caret, element?)`: keep today's `\n`-before-caret scan to rule out an interior/later explicit line (returns `false` immediately, unchanged). When the caret's explicit line is the first one, return `true` only if `element` is absent or `!wrapsWithinRow(element, value.slice(0, caret))`.
   - `isCaretOnLastLine(value, caret, element?)`: symmetric — keep the `\n`-after-caret scan, then when the caret's explicit line is the last one, return `true` only if `element` is absent or `!wrapsWithinRow(element, value.slice(caret))`.
   - Keep the existing `caret == null` and non-numeric-caret short-circuits (still return `true`, matching "an unreadable caret counts as being on the edge").

3. **`web/src/shared/command-bar/useCommandBarKeys.ts`: pass the element.** At the two call sites in `onKeyDown` (the `ArrowUp` and `ArrowDown` cases), add `inputRef.current` as the third argument: `isCaretOnFirstLine(value, inputRef.current?.selectionStart, inputRef.current)` and the `ArrowDown`/`isCaretOnLastLine` equivalent.

No changes to `CommandInput.tsx`, `ConversationComposer.tsx`, or `CommandBarShell.tsx` — both real callers already route through `useCommandBarKeys`.

## Tests

- `web/src/shared/command-bar/caret-row-width.test.ts` (new): stub `HTMLCanvasElement.prototype.getContext` with `vi.spyOn` returning a fake context whose `measureText` returns a controllable `{ width }`, following `edit-render.test.ts`'s pattern.
  - Returns `true` when the measured width exceeds a stubbed `element.clientWidth`.
  - Returns `false` when the measured width is within `clientWidth`.
  - Returns `false` when `getContext('2d')` resolves to `null` (context unavailable).
- `web/src/shared/command-bar/command-caret-lines.test.ts` (extend): with a stubbed textarea-like object and `wrapsWithinRow` exercised through `getContext`/`clientWidth` stubs,
  - a caret past the point where the first explicit line's leading substring would overflow the row is **not** treated as the first line (so `ArrowUp` won't recall).
  - a caret before that overflow point on the first explicit line **is** still treated as the first line.
  - passing no `element` argument reproduces every existing `\n`-only test case unchanged (regression guard for the signature change).
- `web/src/shared/command-bar/useCommandBarKeys.test.tsx` (extend): with the same canvas stub, add a case where a long single-line (no `\n`) value wraps in a narrowed `clientWidth`, and `ArrowUp` at a caret past the wrap point moves within the textarea's own native caret handling (i.e. does **not** call `recallOlder`/change the value to a history entry) — the direct regression test for the reported bug. A companion case confirms `ArrowUp` at a caret before the wrap point still recalls, so the true first-row boundary still works.

Run `$janissary/scripts/run.mjs check-diff` after each step.

## Out of scope

- **Precise wrapped row *count*, or moving the caret vertically ourselves.** The browser's own default `ArrowUp`/`ArrowDown` handling already moves the caret correctly once we simply decline to intercept it (`return` without `preventDefault()`); this fix only corrects the boolean gate deciding whether to intercept.
- **The search bar (`SearchBar.tsx`), `QuickOpen`, `PageAddressInput`, or `QuestionPanel`'s answer field.** None of these are the shared command bar, none support multi-line entry, and the reported bug does not apply to them.
- **Any change to the ghost-suggestion, history-recall, or submit behavior** — `useCommandHistoryRecall.ts`, `ghost-suggestion.ts`, and `submit()`/`insertNewline()` in `useCommandBarKeys.ts` are untouched.
- **CSS or visual changes to the command bar.** This is a pure keyboard-behavior fix.
