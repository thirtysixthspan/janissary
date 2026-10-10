# Preserve task source directory trees

Complexity: 7/10

## Goal

Keep project and built-in task trees independently navigable when a project file shadows a built-in file at the same relative path.

## Approach

Apply project precedence to task files only. Keep each source's ancestor directory rows when that source still has surviving task files, and omit empty source trees. In the picker, key expansion and rendered rows by source plus relative path, reset collapsed-ancestor tracking at source boundaries, and keep parent/child movement within one source. Carry the selected row's source through keyboard and click actions into command construction.

## Implementation steps

1. Update `listTasks` in `src/tasks.ts` to filter shadowed built-in files and retain only directories that contain surviving built-in tasks.
2. Update `web/src/pickers/task-picker-keys.ts` so visibility, expansion keys, navigation, toggles, and picks preserve source identity and stay inside each source tree.
3. Update `useTaskPicker.ts`, `TaskPicker.tsx`, and their callback types to use source plus path for expansion, rendered keys, and command routing.
4. Add server and client tests for overlapping folders, shadowed files, nested ancestors, a collapsed final project folder, independent expansion, rendered keys, and source-specific commands.
5. Update the task picker spec for overlapping source trees and preserve existing command forms.
6. Check help and public docs for existing behavior descriptions that require correction.

## Tests

- `src/tasks.test.ts`: shared directories with project shadows, distinct built-in files, retained nested ancestors, and omitted empty source trees.
- `web/src/pickers/task-picker-keys.test.ts`: source boundary visibility, source-local parent navigation, and source-aware toggle/pick outcomes.
- `web/src/pickers/useTaskPicker.test.ts`: independent expansion and correct source routing when paths overlap.
- `web/src/pickers/TaskPicker.test.tsx`: unique row keys and source-aware click callbacks.
- Run scoped checks after each implementation step and after the spec/backlog update.

## Out of scope

- Changing task file precedence or the `execute ./ai/tasks/...` and `execute $janissary/ai/tasks/...` command forms.
- Changing task discovery refresh timing or picker selection behavior when the filesystem changes.
