# File-tree rename input should extend to the row's right edge

**Complexity: 1/10** — a single missing CSS rule; no component or behavior change.

## Goal

The file-tree in-place rename field (added by `product/plans/complete/file-navigator-rename-editor-sync.md`,
`web/src/FileTreeRowView.tsx`) renders an `InlineEditInput` with `className="files-rename-input"`
but no CSS rule targets that class in `web/src/theme.css`. With no rule, the `<input>` falls back
to the browser's native default text-input width (roughly 20 characters), so it does not fill the
row the way the static `.files-name` span it replaces does (`flex: 1; min-width: 0;`,
`web/src/theme.css:676`) — visually it looks like a short, oddly-clipped box floating in the row
instead of stretching to the tree's right edge. This matches the backlog report exactly.

## Approach

Add a `.files-rename-input` rule to `web/src/theme.css`, alongside the existing `.files-name`/`.files-chevron`
rules, mirroring `.tab-rename-input` (`web/src/theme.css:168-171`, which resets font/color/background/border
so the field reads as an in-place edit rather than a distinct control) plus `flex: 1; min-width: 0;
width: 100%;` so it fills the same space `.files-name` does — extending to the row's right edge,
same as the request. `.files-row` is already a flex container (`display: flex`,
`web/src/theme.css:661-664`), so `flex: 1` on the input behaves the same way it already does on
`.files-name`.

## Implementation steps

1. In `web/src/theme.css`, add a `.files-rename-input` rule immediately after `.files-name--conflict`
   (`web/src/theme.css:679`):
   ```css
   .files-rename-input {
     font: inherit; color: inherit; background: transparent; border: none; outline: none;
     padding: 0; margin: 0; flex: 1; min-width: 0; width: 100%;
   }
   ```

## Tests

This is a pure CSS change — jsdom (the project's test environment) does not apply real stylesheet
layout, so there is no meaningful assertion that the field visually stretches. The existing
`web/src/FileTreeTab.test.tsx` "rename" tests already assert the field renders
(`screen.getByRole('textbox')`); no new test is needed since no component logic changes. Run
`./scripts/run.mjs check-diff` to confirm nothing regresses.

## Spec updates

None. `product/specs/file-tree-tab.md`'s "Renaming a file or directory" section already describes
the field at a behavior level (no layout/CSS specifics belong there per the spec-writing
convention — "no code, no implementation details").

## Docs

- Checked `help.md` and `documentation/user-documentation/tab-types/file-navigator.md` — neither
  describes the rename field's width or layout. No update needed.

## Out of scope

- Any change to `.tab-rename-input` (the tab-strip rename field) — it already fills correctly via
  its caller's dynamic `size` prop (`web/src/TabItem.tsx`), a different, already-working mechanism.
- The other remaining backlog issue (new-directory auto-focus/rename) — a separate fix.
