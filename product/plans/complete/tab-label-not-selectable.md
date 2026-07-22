# Tab labels should not be text selectable

**Complexity: 2/10** — a single CSS rule addition plus a matching test, mirroring an existing
convention already used elsewhere in the same stylesheet.

## Goal

The tab strip's tab labels (the file/session name shown on each tab) are no longer selectable
with the mouse. Clicking and dragging across a tab's label behaves like clicking a UI control —
no text gets highlighted — matching how the file-tree row labels (`.files-row`) and editor
gutter (`.editor-gutter`) already behave. This is unrelated to and does not reverse the metadata
row selectability added in commit `c369acb` ("make metadata text selectable") — that covers
`.image-meta`, `.page-meta`, `.tab-meta`, `.monitor-meta`, `.files-meta` (path/size/status
headers), while this fix covers the `.tab` tab-strip rule itself.

## Approach

`web/src/theme.css`'s `.tab` rule (`web/src/TabItem.tsx`'s tab container, class `tab`/`tab
active`) has no `user-select` rule today, so the label span inside it falls back to the browser
default of selectable text. Add `user-select: none;` to the `.tab` rule, the same pattern already
used for `.files-row` and `.editor-gutter`. The inline rename `<input>` (`.tab-rename-input`) is
untouched — inputs are natively selectable/editable regardless of an ancestor's `user-select`, so
double-click-to-rename keeps working.

## Implementation steps

1. In `web/src/theme.css`, add `user-select: none;` to the `.tab` rule (around line 154-158).

## Tests

- **`web/src/theme.test.ts`** — new test asserting the `.tab` rule contains `user-select: none`,
  mirroring the existing `metadata theme` describe block's regex-based rule assertion style.

## Spec

- **`product/specs/tabs.md`** — add a short note near the existing "Text content in metadata rows
  and headers... is selectable" sentence (around line 87) clarifying that tab labels themselves
  are not selectable, to avoid the two behaviors reading as inconsistent.

## Out of scope

- Any change to `.image-meta`/`.tab-meta`/etc. selectability (commit `c369acb`'s behavior stays).
- Changes to the rename input's own selection behavior.
