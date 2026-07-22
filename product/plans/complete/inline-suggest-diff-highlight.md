# Inline Diff Highlighting for Pending Persona-Suggestion Hunks

**Complexity:** 5/10

## Goal

The focused pending persona-suggestion hunk (see `product/specs/editor-tab.md` "In-editor persona
suggestions") currently renders its `anchor`/`replacement` text as raw `<pre>` blocks in a separate
`PendingSuggestPanel` floating above the buffer. Replace that with an inline preview: the buffer
lines the hunk would remove, struck through in the diff "remove" color, immediately followed by
synthetic rows previewing the lines it would insert, in the diff "add" color — directly in the
buffer body, at the position the change actually applies.

## Approach

`useEditorSuggest.ts`'s `applyHunk` already knows how to splice a hunk's `anchor`/`replacement`
into the full buffer text (`text.indexOf(anchor)`, or append at the end for an empty anchor). A new
pure function, `suggestDiffPreview`, reuses that exact splice (extracted into a shared
`spliceHunk` helper) to compute the hypothetical post-apply text, then reduces the before/after line
arrays to a common-prefix/common-suffix diff — the one contiguous run of lines that actually
changes. That gives a `{ startLine, removedCount, added }` preview for the buffer's rendering path
to slot in.

Rendering stays inside the existing per-line render path: `EditorLines.tsx` (added by
`inline-suggest-status-pill`) already builds a plain list of `EditorLine`s per row; splitting that
list at `startLine`/`startLine + removedCount` and inserting a run of synthetic added-line rows
between the "before" and "after" slices covers the diff, using array slicing rather than a stateful
loop to stay well under the cognitive-complexity limit. `PendingSuggestPanel` keeps its
accept/decline instructions and hunk counter (still the only way to know `a`/`d` do anything and
how many hunks remain) but drops the raw text blocks the inline diff now replaces.

Only the currently focused hunk (`pending.index`) gets an inline preview — matching the existing
one-hunk-at-a-time review flow; there's nothing to preview once all hunks are resolved.

## Implementation

### `web/src/editor/suggestDiff.ts` (new)

```ts
import type { SuggestHunk } from '@shared/protocol';

export function spliceHunk(text: string, hunk: SuggestHunk): string | null {
  const idx = hunk.anchor === '' ? text.length : text.indexOf(hunk.anchor);
  if (idx === -1) return null;
  return `${text.slice(0, idx)}${hunk.replacement}${text.slice(idx + hunk.anchor.length)}`;
}

export type SuggestDiffPreview = { startLine: number; removedCount: number; added: string[] };

export function suggestDiffPreview(lines: string[], hunk: SuggestHunk): SuggestDiffPreview | null {
  const newText = spliceHunk(lines.join('\n'), hunk);
  if (newText === null) return null;
  const newLines = newText.split('\n');

  let prefix = 0;
  while (prefix < lines.length && prefix < newLines.length && lines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < lines.length - prefix && suffix < newLines.length - prefix &&
    lines[lines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix++;

  return {
    startLine: prefix,
    removedCount: lines.length - prefix - suffix,
    added: newLines.slice(prefix, newLines.length - suffix),
  };
}
```

### `web/src/editor/useEditorSuggest.ts`

Replace the local `applyHunk` with the shared `spliceHunk` import — no behavior change, just
de-duplicating the splice logic that `suggestDiffPreview` now also needs.

### `web/src/editor/render.tsx`

- Add `removed?: boolean` to `LineProps`; `EditorLine`'s row `className` gains `editor-diff-remove`
  when set.
- Add a new small component, `DiffAddedLine({ text, gutterCh }: { text: string; gutterCh: number })`,
  rendering one synthetic row (`+` in the gutter instead of a line number, plain text content, no
  caret/selection/tokens — it isn't part of the buffer).

### `web/src/editor/EditorLines.tsx`

- Compute `const diff = pending ? suggestDiffPreview(state.lines, pending.hunks[pending.index]) : null;`
- Extract the existing per-line render body into a small `renderLine(text, index, removed)` closure.
- When `diff` is null, render `state.lines.map` exactly as today.
- When `diff` is set, slice `state.lines` into `before` (`renderLine`, `removed: false`),
  `removedLines` (the `[startLine, startLine + removedCount)` slice, `removed: true`), a run of
  `DiffAddedLine`s from `diff.added`, and `after` (the remaining tail, `removed: false`) — concatenate
  in that order.

### `web/src/editor/PendingSuggestPanel.tsx`

Drop the `hunk.anchor`/`hunk.replacement` `<pre>` blocks; keep only the title and counter.

### `web/src/theme.css`

```css
.editor-diff-remove { background: color-mix(in srgb, var(--error) 15%, transparent); }
.editor-diff-remove .editor-content { text-decoration: line-through; }
.editor-diff-add { background: color-mix(in srgb, var(--success) 15%, transparent); }
.editor-diff-add .editor-gutter { color: var(--success); }
```

## Tests

- New `web/src/editor/suggestDiff.test.ts`: `suggestDiffPreview` for a single-line replacement, a
  multi-line replacement, an appended hunk (`anchor: ''`), and a non-matching anchor (`null`).
- `web/src/editor/useEditorSuggest.test.ts`: existing accept/decline tests keep passing unchanged
  (behavior is identical — only the splice implementation moved).

## Spec

Update `product/specs/editor-tab.md`'s "In-editor persona suggestions" section: the pending change
now previews inline in the buffer (removed lines struck through, added lines shown directly below
in the diff colors) rather than as separate anchor/replacement text blocks.

## Out of scope

- Word-level (as opposed to line-level) diff highlighting within a changed line.
- Multiple simultaneous inline previews (only the focused hunk of the pending set is previewed, same
  as today's one-at-a-time review).
- Any change to the fire/accept/decline flow itself, or to the server protocol.
