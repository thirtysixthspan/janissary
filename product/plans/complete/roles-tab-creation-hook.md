# Roles Tab Creation Hook

**Complexity: 3/10** — a focused roles-feature hook extraction with deferred-reply tests, no change to the plugin contract, and no server work.

## Goal

Move role-creation state and asynchronous ownership rules out of `RolesTab` while preserving the field's existing behavior.

## Approach

Add `useRoleCreation` in the roles feature. It receives the intent function and refusal setter, and owns whether the field is open, its displayed and latest-typed name, and the name-keyed in-flight guard. It exposes the current values and open, type, cancel, and commit handlers. Keep other role mutations, refusal rendering, and all drag/drop behavior in their current owners.

## Implementation steps

1. Add the roles creation hook and update `RolesTab` to render and forward its returned values and handlers.
2. Add focused deferred-reply hook tests for duplicate same-name submission, refusal retention, a late acceptance after newer typing, and overlapping submissions for distinct names; retain the existing component and drag/drop assertions.
3. Run `./scripts/run.mjs check-diff` after each implementation and test change.
4. Update `product/specs/roles.md` with the visible duplicate-submit and late-reply guarantees. Check `help.md` and `documentation/user-documentation/` for already-documented role-creation behavior and update only if affected.

## Tests

- Hook-level deferred-reply tests verify the name-keyed guard suppresses only a duplicate in-flight name and allows a different name to submit.
- Hook-level tests verify an accepted earlier name does not close or erase newer typing, while a refusal keeps the submitted name editable.
- Existing `RolesTab.test.tsx` creation tests and `roles-dnd.test.tsx` continue to pass unchanged.

## Out of scope

- Changing server role validation, persistence, or the plugin intent contract.
- Moving rename, description, entry, refusal-display, or drag/drop rules into the hook.
- Changing the roles tab's public props or user-visible creation behavior.
