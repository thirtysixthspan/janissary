# Tab rename input shows the full file name

## Complexity
2/10 — single-line change in one component, plus tests.

## Problem
The tab strip truncates a tab's display title to `tabNameMaxLength` (`tab.title = title.slice(0, getConfig().tabNameMaxLength)`, `src/tab/creators.ts`). When the user double-clicks the label to rename it, `TabItem.startEdit` seeds the rename input from that same truncated `tab.title`, so editing starts from a chopped-off name instead of the real file name.

## Solution
Seed the rename draft from the untruncated source name when one is available, falling back to `tab.title`/`tab.label` only for tabs that have neither (agent/harness/page tabs, which have no underlying file). Editor, markdown, and image tabs already carry their full on-disk name on `tab.editor.name` / `tab.markdown.name` / `tab.image.name` — those are never truncated.

## Changes

### `web/src/TabItem.tsx`
- Compute `fullName = tab.editor?.name ?? tab.markdown?.name ?? tab.image?.name ?? tab.title ?? tab.label`.
- `startEdit` seeds `draft` from `fullName` instead of `tab.title ?? tab.label`.

### `web/src/TabStrip.test.tsx`
- Add a test: an editor tab whose `title` is truncated but whose `editor.name` is the full file name shows the full name in the rename input on double-click.

## Out of scope
- Whether the committed rename still truncates to `tabNameMaxLength` on submit (separate backlog item about always updating the on-disk file name).
- Widening the input's `maxLength` to 50 characters (separate backlog item).
