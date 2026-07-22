# Offer opener choices for unsupported file types

**Complexity: 5/10** — a small request/reply bridge to the server's opener registry, a local picker
overlay in the file navigator, regression coverage, and behavior/spec documentation.

## Goal

When a file navigator row has no registered opener, double-clicking it should show a picker instead
of silently appending an unsupported-type error. The picker offers editing the file as text or
opening it with the operating system.

## Approach

Ask the server for the opener decision using the file-tree tab's root and relative path, preserving
the server as the source of truth. Known files return the existing `open`/`edit` action directly.
Unknown files return the two fallback actions, which the file-tree component presents and dispatches
through the existing command RPC.

## Implementation steps

1. Add a `fileTreeOpeners` request/reply RPC and server-side file-tree manager method backed by the
   registered opener list.
2. Add a focused file-tree opener picker and hook that handle arrows, Enter, Escape, and row clicks,
   and use them for unsupported files while retaining existing known-file behavior.
3. Add web regression coverage for the picker and update the open/file-tree functional specs and
   user documentation.

## Tests

- Verify an unsupported file opens the picker with edit and external choices.
- Verify selecting the edit choice sends the expected `edit` command.
- Run the existing server opener tests and diff-scoped checks.

## Spec updates

- Update `product/specs/open.md` and `product/specs/file-tree-tab.md` with the unsupported-file
  picker behavior.

## Docs

- Update `documentation/user-documentation/tab-types/file-navigator.md` to explain the picker.

## Out of scope

- Adding new registered file openers or changing the behavior of the `open` command itself.
- The other backlog issues.
