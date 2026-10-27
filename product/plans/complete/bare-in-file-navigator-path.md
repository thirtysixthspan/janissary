# Treat a bare `in` as a file-navigator path

**Complexity: 3/10** — a focused parser adjustment with existing trailing-clause coverage, one manager regression, and concise spec and user-documentation clarifications.

## Goal

Allow `files in` and `files left in` to target a directory literally named `in`, while keeping `files src in` as the existing missing-label error.

## Approach

When an `in` clause has no value and no path precedes it, leave the token for path resolution. The trailing-path scan should report a missing label only when an earlier path token precedes the final bare `in`. Keep the existing `in <label>` and `<path> in <label>` forms unchanged.

## Implementation steps

1. Update `src/file-navigator/args.ts` so a valueless `in` at the start of a target is not consumed as a missing-label clause, and a trailing `in` is missing only when it follows a path.
2. Add parser coverage in `src/file-navigator/args.test.ts` for `in` and `left in`; retain the existing `src in` missing-label cases.
3. Add a manager regression in `src/file-navigator/manager.test.ts` proving `files in` opens a directory named `in`.
4. Clarify the leading bare-path and trailing missing-label behavior in `product/specs/file-navigator-tab.md`. Narrow the corresponding error description in `documentation/user-documentation/tab-types/file-navigator.md` to the path-before-label form.

## Tests

- `src/file-navigator/args.test.ts`: bare `in` is a path target with and without the leading `left` clause; `src in` still reports a missing label.
- `src/file-navigator/manager.test.ts`: `files in` opens the directory literally named `in`.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and after the spec and documentation update.

## Out of scope

- Changing valid `in <label>` forms, label lookup, or the missing-label error for a path followed by `in`.
- Changing sidebar placement, other file-navigator clauses, or unrelated help pages.
