# Show PDF stage scrollbars

Complexity: 1/10.

## Goal

A scrolling PDF exposes a scrollbar for position feedback and direct navigation.

## Approach and implementation

1. Override the shared hidden scrollbar only on pdf-stage, using thin scrollbars and restoring WebKit scrollbar display. Add a stylesheet regression check and run check-diff plus scoped CSS lint.
2. Update the PDF layout spec and the existing viewer scrolling description. Complete this plan and remove the resolved entry.

## Tests

Check computed scrollbar width and the scoped WebKit display rule through the stylesheet. Existing stage-resize tests cover refitting after clientWidth changes. Visual drag/fit verification is unavailable without an attached browser; jsdom cannot verify physical layout.

## Out of scope

Shared stage styling, image panning, scrollbar theming, and fit arithmetic.
