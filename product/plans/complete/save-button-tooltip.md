# Add a "Save" tooltip to the editor save button

**Complexity: 1/10** — a single `title` attribute on one existing button component, matching a
pattern (`title="..."` on toolbar buttons) already used throughout the codebase
(`web/src/FileTreeHeader.tsx:29,32,35,51`, `web/src/DockCycleHeader.tsx:27`). No new component, no
state, no styling.

## Goal

Per the backlog request, the editor's save button should show a tooltip on hover. Currently
`web/src/EditorSaveButton.tsx` only has an `aria-label="Save file"` for accessibility, with nothing
shown visually on hover.

## Approach

Browsers render the native `title` attribute as a hover tooltip with no extra markup, and this is
the codebase's existing convention for simple button tooltips — no dedicated Tooltip component
exists or is needed. Add `title="Save"` to the button in `EditorSaveButton.tsx`, alongside its
existing `aria-label`.

## Implementation steps

1. In `web/src/EditorSaveButton.tsx`, add `title="Save"` to the `<button>` element.

## Tests

New file `web/src/EditorSaveButton.test.tsx`, mirroring the render/assert style of
`web/src/StatusWindowButton.test.tsx` (`render` + `getByTitle` from `@testing-library/react`):

- Renders with the title `"Save"` visible via `getByTitle('Save')`.
- The button is disabled when `dirty` is `false`, and enabled when `dirty` is `true`.
- Clicking the button calls `onSave` when enabled.

Run `./scripts/run.mjs check-diff` after writing the test.

## Spec updates

Checked `product/specs/` for any spec describing the editor save button — none exists (there is no
`editor-tab.md` section on the save button's visual affordances beyond its dirty-state
enable/disable). No spec update needed since a hover tooltip is a minor, purely presentational
affordance not otherwise documented.

## Docs

- Checked `help.md` — no mention of the save button. No update needed.
- Checked `documentation/user-documentation/` — no page documents the save button's tooltip or lack
  thereof. No update needed (out of scope to add new documentation per the task rules).

## Out of scope

- Issue 2 in the backlog (`>` triggering a separate, non-buffer "agent query line" instead of
  inserting a literal `>`) — this requires new UI state for a transient input row excluded from
  buffer content and file serialization, a materially larger redesign of the already-documented
  `>`-led request-line feature (see [[editor-tab]]). Left in the backlog as its own entry; not
  picked for this pass because of its complexity (rated 7+, requiring significant new
  architecture).
- Any other button's tooltip or the save button's icon, styling, or disabled behavior.
