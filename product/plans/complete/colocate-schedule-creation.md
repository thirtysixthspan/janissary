# Colocate schedule creation

**Complexity: 8/10** — moving four files is mechanical, but the destination is a concrete client-plugin directory whose enforced boundary forbids the dialog's current `JanusClient`, shared protocol, and app-level launch-dialog imports. The move therefore requires a narrow host-to-feature action contract and local modal lifecycle wiring while preserving every existing interaction.

## Goal

Move the web schedule-creation dialog, its command builder, and their tests into `web/src/plugins/schedules/` so schedule creation and schedule display live under one feature directory. Preserve the existing form, validation, submission order, cancellation, keyboard handling, remembered values, and modal focus behavior.

## Approach

Treat `AppMain` as the app-shell composition point. It continues to own `JanusClient` and translates the schedule launch view into primitive dialog props plus `onSubmit` and `onCancel` callbacks. The colocated dialog receives only those narrow capabilities, so it does not import host protocol, socket, or app-hook modules across the plugin boundary.

The dialog will own its existing modal lifecycle locally: focus on mount, capture Escape and Enter, swallow outside clicks without closing, and focus the submit button when remembered valid settings are restored. The pure command builder moves unchanged beside it. The schedules tab continues to load through the plugin registry; this change does not alter the tab-plugin contract or make the creation dialog a plugin tab contribution.

## Implementation steps

1. Atomically move `schedule-command.ts`, `ScheduleDialog.tsx`, and their tests into `web/src/plugins/schedules/`, preserving all command forms while replacing `ScheduleLaunchView` and `JanusClient` props with `targets`, `activeTarget`, `onSubmit`, and `onCancel`; replace the forbidden host launch hook with equivalent local modal lifecycle wiring. Update `AppMain` in the same step to import the relocated dialog and adapt `JanusClient` into those narrow callbacks, preserving command-before-close ordering.
2. Update the scheduling spec to pin the modal's existing outside-click behavior, which the relocated lifecycle code must preserve.
3. Remove the resolved technical-debt entry and promote this plan to complete after all checks pass.

## Tests

- Move the seven pure command-builder tests and keep every expected command string unchanged.
- Move the schedule-dialog interaction suite and adapt its harness to callback props.
- Keep coverage for each conditional form, validation, submit, Cancel, Escape, and remembered settings.
- Add a regression case proving an outside click does not close or submit the modal.
- Run `./scripts/run.mjs check-diff` after each implementation step and after the spec/backlog changes.

## Out of scope

- Changes to schedule command grammar, server validation, persistence, firing, or targeting.
- Changes to the schedules tab plugin, its registry loading, payload, intents, or display.
- Generalizing modal lifecycle code across other dialogs.
- Changes to `help.md` or public user documentation, which do not currently describe this dialog's internal organization or outside-click behavior.
