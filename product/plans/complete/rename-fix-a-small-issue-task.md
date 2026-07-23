# Rename ai/tasks/fix-a-small-issue.md to fix-an-issue.md

**Complexity: 2/10** — a file rename plus updating literal string references; no logic changes.

## Goal

`ai/tasks/fix-a-small-issue.md` is renamed to `ai/tasks/fix-an-issue.md`. Every place that names the file by path — the root `commands.md` scratch file, the task-picker functional spec, and its user documentation page — is updated to match. The file's own content is unaffected other than the rename itself (its title `# Fix a Small Issue` already describes the task generically and needs no change; it doesn't refer to its own filename anywhere in its body).

## Approach

This is a pure rename-and-update-references task:

1. Rename the file itself.
2. Update the two `schedule` lines in `commands.md` that reference the old path.
3. Update `product/specs/task-picker.md`, which uses `fix-a-small-issue.md` as its example filename twice (the intro list and the extension-hiding example).
4. Update `documentation/user-documentation/command-bar/tasks.md`, which uses it as an example task filename.

Occurrences of the literal string `fix-a-small-issue` in test fixtures (`src/tasks.test.ts`, `src/controller.test.ts`, `web/src/useWindowKeys.test.ts`, `web/src/useTaskPicker.test.ts`) and in a code comment in `src/tasks.ts` are unrelated to this repository's real task file — they use it as an arbitrary example filename to exercise generic task-listing/scheduling behavior, not as a reference to the actual file. Renaming the real file doesn't change what those tests exercise, so they're left as-is; touching them would be an unrequested, out-of-scope diff (the issue asks for spec/documentation references, not a global string rename).

## Implementation steps

1. `git mv ai/tasks/fix-a-small-issue.md ai/tasks/fix-an-issue.md`.
2. `commands.md`: replace both `./ai/tasks/fix-a-small-issue.md` occurrences with `./ai/tasks/fix-an-issue.md`.
3. `product/specs/task-picker.md`: replace both `fix-a-small-issue.md`/`fix-a-small-issue` occurrences with `fix-an-issue.md`/`fix-an-issue`.
4. `documentation/user-documentation/command-bar/tasks.md`: replace `fix-a-small-issue.md` with `fix-an-issue.md`.
5. Run `./scripts/run.mjs check-diff`.

## Tests

None — this is a documentation/reference rename with no behavior change; no test exercises the literal filename `fix-a-small-issue.md` against the real `ai/tasks/` directory (the picker's tests all use synthetic fixtures, unaffected by this rename).

## Out of scope

- Renaming the arbitrary example filename used in test fixtures across `src/tasks.test.ts`, `src/controller.test.ts`, `web/src/useWindowKeys.test.ts`, `web/src/useTaskPicker.test.ts`, or the code comment in `src/tasks.ts` — none of these reference the real file; they're unrelated example strings.
