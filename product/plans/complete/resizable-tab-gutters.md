# Resize application areas from tab gutters

**Complexity: 4/10** — the resize state and drag calculations already exist; the change is a
small shared control and focused UI/test/spec updates across the two sidebar strips and the
monitoring strip.

## Goal

Make application-area resizing discoverable by placing one right-aligned draggable up/down-arrow
button in each sidebar tab gutter and in the monitoring tab gutter. Preserve the existing sidebar
width and monitoring-height limits, layout reporting, and profile-driven sizing.

## Approach

Extract the shared draggable button presentation and mouse gesture wiring into a focused web
component. Let each owning area retain its current axis-specific resize calculation and pass the
button into its tab strip. Remove the standalone border dividers and update the affected behavior
specifications and user documentation.

## Implementation steps

1. Add the shared draggable resize button and expose an optional right-side control slot on
   `TabStrip`.
2. Replace the sidebar and reporting border dividers with the shared button while preserving their
   existing clamps and server layout callbacks.
3. Style the button in the tab gutter and remove the old divider styling.

## Tests

- Update sidebar resize tests to drag the gutter button and retain minimum/maximum clamp and
  mouseup coverage.
- Update reporting resize tests to drag the gutter button and retain height clamp and mouseup
  coverage.
- Add a shared button rendering/drag test covering its accessible label and forwarding behavior.

## Spec updates

- Update `product/specs/sidebars.md` to describe the right-aligned draggable gutter button.
- Update `product/specs/monitoring.md` to describe the reporting gutter button.

## Documentation updates

- Update `documentation/user-documentation/getting-started/tabs.md` and
  `documentation/user-documentation/tab-types/file-navigator.md` for sidebar resizing.
- Update `documentation/user-documentation/automation/monitoring.md` for reporting-area resizing.

## Out of scope

- Changing resize limits, persisted/profile layout values, or server layout events.
- Adding resize controls to the central tab strip or changing keyboard navigation.
