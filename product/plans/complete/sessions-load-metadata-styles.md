# Load sessions metadata styles

Issue: in the sessions tab, replicate the elements and styles of the agent metadata row but only contain the the buttons (refresh and split) floated right.

Complexity: 2/10

## Goal

Show the sessions metadata row with only Refresh and Split aligned right, including when Sessions is the first plugin opened.

## Approach

The existing markup and icon rules match the agent metadata treatment, but the plugin entry never imports the shared stylesheet that supplies the flex header and right-aligned action group. Load it directly from the sessions entry, following the other plugins.

## Implementation steps

1. Import the shared plugin styles before the sessions styles and add regression tests for independent style loading and the header's two controls. Run check-diff.
2. Update the sessions spec, remove the resolved backlog entry, and promote this plan after checks pass.

## Tests

- The sessions entry explicitly loads the shared header and action layout styles.
- The rendered header contains only Refresh and the supplied Split control, with both inside the action group.
- Existing refresh interaction tests continue to pass.

## Specs / docs

Update product/specs/sessions-tab.md to describe the button-only header on first opening. No help or public documentation describes this layout.

## Out of scope

Table alignment, session lifecycle, other plugin layouts, and PR description changes.
