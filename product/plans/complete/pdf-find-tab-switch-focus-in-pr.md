# Clarify focus in the PDF tab-switch verification

**Complexity: 1/10** — This adds one action to the pull request's manual verification instructions; it does not change application behavior.

## Goal

Make the PR's tab-switch find check focus the PDF tab before it presses `Cmd+F`, so the shortcut reaches the PDF plugin.

## Approach

The application routes a claimed chord by the label enclosing the focused element. `chordTabLabel` in `web/src/useWindowKeys.ts` uses `enclosingTabLabel` for a focused element such as a tab-strip button, and the button has no plugin label. The PDF's claim is registered through `usePluginChordClaims` in `web/src/plugins/PluginChords.tsx` only for the active tab, and `registry.run` requires the PDF label. Focusing the PDF's Zoom in control places focus inside the labeled tab and lets its claim handle `Cmd+F`.

Add the corrected tab-switch flow as a fourth numbered action in the PR description's existing `How to verify` section. Preserve every other paragraph, including `Additional test cases`. The existing PDF spec already describes that the chord must reach the active tab, so no spec or application change is needed.

## Implementation steps

1. Add the tab-switch verification action: open find in a PDF with a non-empty query, switch away and confirm the overlay closes, return to the PDF, click Zoom in, press `Cmd+F`, and confirm the overlay opens with an empty query.
2. Remove only the resolved focus clarification entry from `product/backlog/pull-request.md` and promote this plan to `complete`.
3. Commit and push those changes to the existing PR branch, then add the corrected action to the PR description's `How to verify` section while preserving all other text.

## Tests

No automated tests are needed because this is a verification-instruction correction and does not change application behavior. Run `$janissary/scripts/run.mjs check-diff` after the plan and backlog changes. After the description edit, read the current PR body and confirm the new action appears in `How to verify` while the other sections remain unchanged.

## Spec

No spec change is needed. `product/specs/pdf-tab.md` already says that `Cmd+F` is answered when the chord reaches the active PDF tab, and that switching away closes the overlay.

## Docs

No help or user-documentation change is needed because the application behavior does not change.

## Out of scope

- Changing application chord routing or PDF focus behavior.
- Editing the PR description outside `How to verify`.
- Changing the PR title or `Additional test cases` section.
- Editing any other backlog entry.
