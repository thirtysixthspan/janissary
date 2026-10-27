# Clarify task picker help for harness tabs

Complexity: 2/10

## Goal

Describe both task-picker destinations accurately in `help/tasks.md`: command-line insertion in command-bar tabs and terminal input in harness tabs.

## Approach

Keep this as a help-text correction. The picker implementation and its tests already cover both destinations, and `product/specs/task-picker.md` already describes them accurately. The explicit instruction for this recorded finding overrides the repair task's complexity-7 selection cutoff.

## Implementation steps

1. Update the description and relevant use-case wording in `help/tasks.md` to say command-bar tabs receive the task command at the cursor without running it, while harness tabs send the command to their terminal input and return keyboard focus there.
2. Run the existing `web/src/pickers/useTaskPicker.test.ts` tests to verify both destinations against the implementation, then run `$janissary/scripts/run.mjs check-diff`.
3. Confirm `product/specs/task-picker.md` still matches the implemented behavior. No spec change is needed because it already states both destinations.

## Tests and verification

No new tests are needed for this documentation-only correction. The existing `web/src/pickers/useTaskPicker.test.ts` cases cover command-line insertion without submission, PTY input on harness tabs, and returning focus to the harness terminal. Run that file and `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Changing task-picker behavior or its implementation tests.
- Rewriting the already-accurate `product/specs/task-picker.md` behavior.
- Changing unrelated help pages or user documentation.
