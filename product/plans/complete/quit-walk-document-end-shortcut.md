# Correct the quit-walk document-end verification shortcut

**Complexity: 2/10** — correct two shortcut instructions in the pull request description and manually repeat the affected verification cases. The application behavior and editor bindings already match the documented shortcut.

## Goal

Make D1 and D8 append their test edits at the end of the editor buffer on macOS and Linux, so their expected file contents reflect the intended quit-walk checks.

## Approach

Use the editor's existing document-end bindings: Cmd+Down on macOS and Ctrl+End on Linux. Update the shared Setup instruction and the D8 instruction in the pull request description, preserving its expected ` gamma-editedZ` suffix and all unrelated description text.

## Implementation steps

1. Confirm the editor maps Cmd+Down and Ctrl+End to document end and that existing help describes those bindings.
2. Manually repeat D1 and D8, confirming each inserted suffix lands at the end of the corresponding initial buffer and the described walk behavior remains observable.
3. After pushing the plan and backlog update, correct only the shared Setup and D8 shortcut phrases in the pull request description.

## Tests

Attempt D1 and D8 from fresh scratch fixtures in the attached browser. The driver focused the active, visible editor textarea and sent Cmd+Down, but typed text did not change the rendered buffer, so the manual cases could not reach their quit-walk assertions. The existing `web/src/editor/keys.test.ts` suite passes all 10 tests, including the Cmd+ArrowDown document-end mapping; the Linux Ctrl+End mapping is also covered there.

## Spec and documentation

No spec or public documentation changes are needed. The existing editor behavior is unchanged, and `help/keys.md` plus the editor user documentation already state the supported bindings.

## Out of scope

- Changing editor key bindings, editor code, or automated tests.
- Changing any other verification step or behavior example in the pull request description.
- Editing the separate fixture-reset backlog entry.
