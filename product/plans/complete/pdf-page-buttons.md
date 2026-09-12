# Add single-page PDF navigation buttons

Complexity: 2/10.

## Goal

Readers can navigate single-page layout using accessible Previous page and Next page controls.

## Approach and implementation

1. Add two icon-only header buttons before the host split action, using pdf-action styling and the existing pageBy handlers. Show them only in single-page layout and disable them at document boundaries. Extend header and interaction tests; run check-diff.
2. Update the PDF layout/navigation spec and viewer control table. The original completed plugin plan already requires these buttons. Complete this plan and remove the resolved backlog entry.

## Tests

Assert both accessible controls in single-page layout, neither in continuous layout, clicks updating the page readout, boundary disabling, and previous-page navigation. Inspect the existing wrapping metadata header; an attached browser is unavailable for checking narrow-pane appearance.

## Out of scope

Keyboard semantics, zoom, new styling, and layout persistence.
