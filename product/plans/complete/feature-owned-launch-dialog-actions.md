# Feature-owned launch-dialog actions

Complexity: 4/10

## Goal

Keep shared launch-dialog keyboard and focus behavior independent of harness and schedule RPC policies.

## Approach

Make `useLaunchDialog` accept generic cancel/create callbacks, a current submit-eligibility boolean, and the remembered-selection flag. Keep only dialog refs, Enter/Escape wiring through `useDialogKeyboard`, and remembered-submit focus in the shared hook. Add feature-owned action hooks for harness and schedule to build commands and send the command and exact close RPC in order. Schedule eligibility remains in the schedule feature.

## Implementation steps

1. Replace the shared hook's client, feature close-method union, fields, and command builder inputs with callbacks and eligibility; update its focused unit tests to cover callback invocation, eligibility, fresh callbacks after rerender, and remembered focus.
2. Add `useHarnessLaunchActions` and `useScheduleLaunchActions` in their owning feature directories, then wire both dialogs through those hooks without changing component props.
3. Preserve command-before-close ordering and validate the existing dialog tests for submission, invalid Enter, Escape, cancellation, and reopen behavior.

## Tests

- Shared hook tests cover callbacks, submit eligibility, callback refresh after rerender, and focus restoration.
- Existing harness and schedule dialog tests cover feature command text, close RPC names/order, validation, cancellation, Escape, and remembered selections.

## Spec and documentation

No behavior changes for users; no spec or public documentation update is needed.

## Out of scope

Changing launch forms, command grammar, wire contracts, component props, or application-shell callers.
