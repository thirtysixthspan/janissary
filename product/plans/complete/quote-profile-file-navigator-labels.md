# Quote profile file-navigator labels when restoring profiles

**Complexity: 2/10** — a small serialization fix in the existing profile restore path, two focused regressions, and one spec clarification.

## Goal

Restore profile file navigators at the intended tab when the saved `in` label contains whitespace or quote characters.

## Approach

Keep `ProfileFilesEntry.in` as the plain tab label. When `filesCommand` builds the equivalent `files in <label>` command, leave a safe one-word label unquoted; otherwise wrap it in double quotes and escape embedded double quotes using the same quoted-token syntax as the `files` parser. Verify the generated command by parsing it back and checking that it retains the original label.

## Implementation steps

1. Add a label serializer in `src/profile/files.ts` and use it for the `in` clause, preserving bare serialization for safe one-word labels.
2. Add regressions in `src/profile/files.test.ts` for a label containing spaces and one containing embedded double quotes. Assert both the generated command and the parsed label.
3. Clarify in `product/specs/profiles.md` that the stored `in` value is a plain label and command construction quotes and escapes it as needed.

## Tests

- `src/profile/files.test.ts`: a multiword label is emitted as one quoted token and parses back unchanged.
- `src/profile/files.test.ts`: a label with embedded double quotes is emitted with those quotes escaped and parses back unchanged.
- Diff-scoped checks were run after each implementation step; all passed.

## Out of scope

- Changing profile storage or validation for `in` values.
- Changing the `files in` command grammar or behavior for stale/missing labels.
- Changing profile path quoting, tree-view restoration, help, or user documentation.
