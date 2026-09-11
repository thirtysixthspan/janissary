# Keep PDF pages fitted when the stage resizes

Complexity: 3/10.

## Goal

A fitted PDF tracks its stage when thumbnails, splits, or sidebar docking change the available space.

## Approach and implementation

1. Measure the stage in a layout effect and observe its element size with ResizeObserver. Commit only changed dimensions, disconnect on teardown, and preserve padding and fit calculations. Extend the existing tab tests with an observer stub and scale assertions; run check-diff.
2. Update the PDF zoom spec and existing viewer documentation. Complete the plan and remove the resolved backlog entry.

## Tests

Verify initial fit, a narrower stage, a wider stage, unchanged-size callbacks without another render, observer registration and disposal, and the existing pure fit tests. Browser verification of thumbnail toggling is unavailable because this workspace has no attached browser; record that limitation rather than launching another browser.

## Out of scope

Fit formulas, scrollbar styling, page controls, and host pane behavior.
