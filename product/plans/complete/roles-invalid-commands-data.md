# Treat invalid commands topic data consistently in Roles

**Complexity: 2/10**

## Goal

The Roles tab handles a malformed commands topic snapshot the same deliberate way everywhere instead of failing on open and silently dropping restrictions on repaint.

## Approach

Opening the tab keeps reporting `invalid commands topic data`. A repaint with an unreadable snapshot keeps the restrictions the plugin last accepted so the tab stays usable and no grant looks falsely available; when none was ever accepted, nothing is published.

## Implementation steps

1. Remember the last accepted restrictions in `src/plugins/roles/activate.ts` and use them in `publish` when the snapshot is invalid.
2. State the choice in `product/specs/roles.md`.

## Tests

- A notification with invalid data after a valid open republishes the previous restrictions without throwing.
- Invalid data before any accepted restrictions publishes nothing.
- The existing open failure, mapping, picker, and grant tests stay unchanged.

## Out of scope

- Surfacing the refused data in the tab.
