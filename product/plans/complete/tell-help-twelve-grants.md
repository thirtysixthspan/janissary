# Correct the tell help page's default grants

**Complexity: 1/10** — 0 production lines and files, 3 documentation requirements, no code scenarios (p=2.55)

## Goal

`help/tell.md` says the default tell role has all ten native commands and ends its list at file read, while `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts` now grants all twelve `NATIVE_ACP_COMMANDS`, including file write and file edit. Bring the help page in line with the code and with `product/specs/roles.md`.

## Approach

A wording-only edit to the help page. No production code changes.

## Implementation steps

1. In `help/tell.md`, change "all ten native commands" to "all twelve native commands" and extend the list with file read, write, and edit.
2. Add one sentence saying an existing roles file is not migrated, so a saved tell keeps the grants it lists, matching `product/specs/roles.md` and `documentation/user-documentation/tab-types/roles.md`.
3. Confirm `help/ask.md` still matches the unchanged ask grants, and grep `help/` and `documentation/` for any other "ten native" or stale tell list.

## Tests

No behavior changes, so no new tests. `check-diff` must pass, including any test that reads help pages.

## Out of scope

The remote documentation, primer, and port-sharing entries in the pull request backlog.
