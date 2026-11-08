# Keep running ACP marker names stable after shell renames

**Complexity: 2/10** — use the active role record's existing name when creating a dispatch receipt, with the current tab name as the first-record fallback.

## Goal

Keep a running `ask` or `tell` marker's tooltip and accessible name aligned with the connection tab it opens after the owning shell tab is renamed. Before a role has a record, use the shell's current title or label.

## Approach

`runAcpCommand` currently formats every receipt from the shell tab's current title or label. A role runtime retains the active record id, and the matching record retains the owner name captured when the record began. Use that record's `recordConnectionName` when it exists, falling back to the current shell name otherwise. Keep the receipt's existing role reference so the marker continues opening the live connection for that role.

## Implementation steps

1. Derive the receipt name from the tab runtime's role record when that record remains available, and preserve the current title-or-label fallback when there is no record.
2. Cover the title fallback and a reused role record after a shell rename in `src/acp/plugin-session.test.ts`. Confirm the running role reference still opens the same record.
3. Update the Core ACP connections behavior in `product/specs/shell-tab.md` to describe how the running marker is named across a tab rename.
4. Promote this plan and remove only this fix's entry from the pull-request backlog.

## Tests

- `src/acp/plugin-session.test.ts`: an initial dispatch without a role record uses the current tab title, while the existing initial dispatch case continues to cover the label fallback.
- `src/acp/plugin-session.test.ts`: after the first dispatch creates a role record, renaming the shell and dispatching again uses that record's connection name; following the receipt's role reference resolves to the same record.

## Specs and documentation

- `product/specs/shell-tab.md`: state that a running marker uses the active role record's connection name after a rename, and the current tab title or label before that record exists.
- Help and user documentation already describe what the marker opens but do not describe its name after a rename, so no public wording change is needed.

## Out of scope

- Changing the marker's role reference or the connection opener.
- Changing settled reply links, connection record names, or record ownership.
- The separate security finding in the pull-request backlog.

## Verification outcome

The diff-scoped check passed after the implementation, tests, and spec update: lint, typecheck, and server tests all passed.
