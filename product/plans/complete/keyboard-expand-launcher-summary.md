# Expand launcher summaries with the keyboard

**Complexity: 3/10** — summary text already has a collapsed and expanded CSS state. The list's selected index identifies the keyboard-focused row, so arrow keys can toggle that row's expansion without changing the summary data flow.

## Goal

Let keyboard users expand and collapse the focused tab's summary with Right Arrow and Left Arrow, matching the extra description currently available on hover.

## Approach

Keep the expanded row index in the launcher tab list. Right Arrow expands the selected row, Left Arrow collapses it, and moving selection to another row stops applying the expanded style. Expose the state through `aria-expanded` on rows with summaries and retain hover expansion.

## Implementation steps

1. Track summary expansion in `LauncherTabList`, handle ArrowRight and ArrowLeft, and pass the state to each row.
2. Apply the expanded class and `aria-expanded` state in `LauncherTabRowView`; extend the stylesheet so an expanded row shows the same eight-line description as hover.
3. Add tests for keyboard expansion and collapse, including that expansion follows the selected row.
4. Update the launcher spec with the keyboard controls.

## Tests

Extend `web/src/plugins/launcher/LauncherTab.test.tsx` to assert Right Arrow expands the selected summary, Left Arrow collapses it, and the expanded state follows keyboard selection.

## Out of scope

- Changing summary generation, row ordering, or hover behavior.
- Removing the existing three-line collapsed limit.
