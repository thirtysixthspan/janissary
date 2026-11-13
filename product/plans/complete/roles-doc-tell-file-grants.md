# Roles tab documentation: tell's file write and edit grants

**Complexity: 1/10** — documentation-only change: 0 production lines, 0 files, 1 requirement (p=2.07)

## Goal

Make the Grant commands section of the Roles tab user documentation agree with the built-in tell role, which now also grants file write and file edit, and state that ask stays read-only for files.

## Approach

Edit the paragraph beginning "The built-in **ask** role can read a file" in `documentation/user-documentation/tab-types/roles.md` so its Tell sentence lists creating or deleting databases, evaluating browser pages, and writing and editing workspace files, matching the `ask` and `tell` command lists in `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts`.

## Implementation steps

1. Rewrite the Tell sentence of that paragraph and add that ask can read files but not change them.
2. Grep `documentation/` for "evaluate browser pages" and "database create/delete and browser eval" to confirm no stale tell list remains.

## Tests

No code changes, so no automated tests. Verification is reading the page and the greps above; `check-diff` confirms nothing else regressed.

## Out of scope

Any change to the default roles themselves, specs, or other documentation pages.
