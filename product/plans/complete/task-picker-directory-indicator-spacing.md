# Add spacing after task-picker directory indicators

**Complexity: 1/10** — a small task-picker style adjustment with a focused component test.

## Goal

Make directory names visually distinct from their expand/collapse chevrons in the task selector.

## Approach

Add a small right margin to the task picker's `.picker-chevron` element. Keep the change scoped to the task picker so other pickers that share the class remain unchanged. Assert in the component test that the directory row includes spacing after the indicator.

## Implementation steps

1. Add task-picker-specific spacing after `.picker-chevron` in `web/src/theme.css`.
2. Add a component test that verifies the task picker renders a spacing element after the directory indicator.

## Tests

- Extend `web/src/pickers/TaskPicker.test.tsx` to assert the directory chevron has a right margin.
- Run `$janissary/scripts/run.mjs check-diff`.

## Spec

Update `product/specs/task-picker.md` to state that directory rows leave a space between the chevron and folder name.

## Documentation

Update the task-picker user guide because it already describes the directory chevron and row layout.

## Out of scope

- Changing directory expansion behavior or picker navigation.
- Changing spacing in other picker components.
