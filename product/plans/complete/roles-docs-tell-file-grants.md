# Roles Documentation: Tell File Write and Edit Grants

**Complexity: 1/10** — documentation-only: 0 production lines, 0 production files, 3 requirements (p=2.55)

## Goal

Bring the user documentation in line with the built-in tell role, which now grants `file write` and `file edit`, and with the native command list, which now holds twelve commands.

## Approach

Edit wording only, cross-checked against `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts`, `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts`, and `product/specs/roles.md`.

## Implementation steps

1. In `documentation/user-documentation/tab-types/roles.md`, change the Tell sentence in the defaults paragraph to add writing and editing workspace files, and note that an existing roles file is not changed so a saved tell keeps the grants it lists.
2. In the same page, change "all ten native commands" to "all twelve native commands".
3. In `documentation/user-documentation/advanced-agents/acp-agent.md`, update both Tell sentences to add writing and editing workspace files.

## Tests

No production code changes, so no automated tests; verify by read-through and by searching `documentation/` for "ten native" and the old Tell wording.

## Out of scope

- Any code, spec, or role-default change.
- The proposal's "built-in ask role can read a file" paragraph does not exist in the current page, so nothing changes there.
