# Prefer the workspace symbol for a remote file navigator root

**Complexity: 2/10** — one display-format branch, its focused server test, and updates to the existing behavior descriptions.

## Goal

A remote file navigator rooted at its workspace should show `$workspace/<name>` instead of `$root/`, so the header identifies which workspace the tree belongs to.

## Approach

Keep the existing workspace-relative formatting for paths below the remote workspace. When the navigator root equals the workspace root, return the workspace symbol with the final path component as its name. Preserve the absolute root used for filesystem operations.

## Implementation

1. Update `src/tab/remote-file-navigator-root.ts` so an exact workspace-root match returns `$workspace/<name>`.
2. Update the corresponding case in `src/tab/view.test.ts` to assert the display shortcut and unchanged absolute path.
3. Update `product/specs/file-navigator-tab.md` and `product/specs/root-path.md` to specify the workspace symbol at the remote workspace root.
4. Update `documentation/user-documentation/advanced-agents/remote-agents.md` and `documentation/user-documentation/tab-types/file-navigator.md`, which currently describe the root as `$root/`.

## Tests

- The remote workspace-root case in `src/tab/view.test.ts` displays `$workspace/<name>` and continues to expose the absolute root unchanged.
- The existing nested remote-root case continues to display `$workspace/<name>/<rest>`.

## Out of scope

- Local file navigator path formatting.
- Paths outside the remote workspace and filesystem operations.
- Changes to help text, which does not describe this header behavior.
