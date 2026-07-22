# Add a schedules-tab clear button

**Complexity: 3/10** — expose the existing schedule-clear operation through one RPC and add a
metadata action with a small UI regression test.

## Goal

Add a right-aligned button to the schedules tab metadata header that clears every schedule across
all agent and harness tabs.

## Approach

Reuse the schedule manager's persistence and state-refresh conventions in a new `clearAll` method.
Render a disabled clear button when the aggregate is empty, while retaining the existing dock-cycle
button beside it when docked.

## Implementation steps

1. Add the `clearSchedules` RPC and schedule-manager/controller handling.
2. Add the header button, icon, styling, and client regression coverage.

## Tests

- Verify the button is present, disabled for an empty list, and sends `clearSchedules` when clicked
  with entries.
- Run the existing schedule-manager tests and diff-scoped checks.

## Spec updates

- Update `product/specs/scheduling.md` to describe the schedules-tab clear action.

## Docs

- Update the scheduling user documentation if it already describes schedules-tab controls.

## Out of scope

- Changing schedule command parsing or per-row deletion behavior.
- The other backlog issues.
