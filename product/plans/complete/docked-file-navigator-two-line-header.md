# Fix: stack the docked file navigator's metadata row onto two lines

**Complexity: 2/10** — the change is one modifier class on the file navigator's existing header, the rules that lay it out, and the colocated tests. No server, protocol, or tree-behavior work is involved.

## Goal

When a file navigator is docked into a sidebar, give its metadata row two lines: the root path, branch, and host chip on the first, and the header's action buttons alone on the second. Undocked in the centre strip the row stays on one line as it is now.

## Approach

The header is a single flex row that puts the metadata at the leading edge and the actions at the trailing edge. In the centre strip that fits. A sidebar is narrow enough that a root path and six or seven icon buttons compete for the same line, which squeezes the path down to almost nothing.

The header already knows whether it is docked — it reads the same `dock` value that decides whether to offer the split control. It adds a docked modifier class alongside `files-header`, and that class turns the row into a column: the metadata block takes the first line at its natural height, and the action group takes the second, still pushed to the trailing edge by the automatic margin every host action group carries. Nothing about which buttons appear, or the tree beneath the header, changes.

## Implementation steps

1. Update `web/src/file-navigator/FileNavigatorHeader.tsx` to add a `files-header--docked` modifier class when the tree is docked.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Add the docked header rules to `web/src/theme.css` beside the existing `.files-header` rule.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Extend `web/src/file-navigator/FileNavigatorHeader.test.tsx` and `web/src/theme.test.ts` with the cases below.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.
7. Update `product/specs/file-navigator-tab.md` to state that a docked tree's header takes two lines.
8. Check `help.md` and `documentation/user-documentation/` for existing file-navigator header guidance, update it only if present, then run `./scripts/run.mjs check-diff`.

## Tests

- A docked header carries the docked modifier class beside `files-header`; a header in the centre strip does not.
- A docked header still renders its metadata block and its action group, with the same buttons the undocked header offers apart from the split control it already withholds while docked.
- The docked header rule stacks the row into a column and leaves the action group at the trailing edge.

## Out of scope

- Which buttons the header offers, docked or not.
- The metadata row of any other tab kind, including the notifications tab that shares the sidebar.
- Sidebar width, resizing, and the sidebar's own tab strip.
- The tree, its rows, and every tree interaction.

## Verification

- `./scripts/run.mjs check-diff` passes after implementation, tests, and spec updates.
- PR #952 remains open and receives the completed commit on `feature/conversations-plugin`.
