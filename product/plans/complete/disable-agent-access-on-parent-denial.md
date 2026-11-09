# Disable Agent access when a parent denies agent access
**Complexity: 2/10** — one predicate and one note condition in the Commands tab, driven by a parent lookup instead of the row's own saved value.

## Goal

A native child row shows a disabled Agent access checkbox and the `Disabled by parent command: <parent>.` note whenever its parent is effectively enabled but denies agent access, even when the child's own saved `agentAccess` is already off.

## Approach

- `web/src/plugins/commands/commands-keys.ts`: add `isParentAgentDenied(rows, row)`, true when the row's parent is in `rows`, effectively enabled, and has `effectiveAgentAccess` false. `isAgentAccessDisabled` uses it in place of `row.agentAccess && !row.effectiveAgentAccess`.
- `web/src/plugins/commands/CommandRow.tsx`: the note's parent-denial condition uses the same helper, so the note and the checkbox agree. The saved value and row dimming are unchanged.

## Tests

- `commands-keys.test.ts`: own-off child with a denying parent is disabled; own-off child with an allowing parent stays interactive.
- `CommandsTab.test.tsx`: the parent-denial case now carries its parent row; own-off child with a denying parent is disabled with the note; own-off child with an allowing parent is interactive with no note.

## Out of scope

`isParentDisabled`, native-only checkbox rendering, and server behavior.
