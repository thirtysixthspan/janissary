# Cancel PDF loads when tabs close

Complexity: 3/10.

## Goal

Closing a PDF tab immediately releases an unfinished load and never reports its late result.

## Approach and implementation

1. Add an optional abort signal to the PDF loader, connect it to idempotent loading-task destruction, and abort from the owning hook's cleanup. Preserve late-success destruction and loaded-document cleanup. Add lifecycle regression tests and run check-diff.
2. Update the PDF closing spec and existing lifecycle documentation, complete this plan, and remove the resolved backlog entry.

## Tests

Cover abort before load completion, late failure without notification, late success destruction, and normal loaded-document teardown. Retain existing failure mapping and once-per-tab tests.

Pending-promise fixtures use the existing documented lint suppression for the web target's lack of ES2024 Promise.withResolvers typings.

## Out of scope

Page rendering, navigation, dependencies, and host lifecycle changes.
