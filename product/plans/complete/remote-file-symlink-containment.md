# Refuse remote file paths that follow symlinks outside the workspace

**Complexity: 5/10** — one far-side containment helper and focused remote file navigator coverage, using the existing refusal path.

## Goal

Keep remote file navigator requests within the canonical provisioned workspace when a requested path crosses a symlink.

## Approach

Retain lexical containment as the first check, then resolve the candidate through existing filesystem components and compare its real path with the real workspace root. For a not-yet-created path, check the nearest existing ancestor so a missing child below an outside symlink is still refused. Preserve the existing refusal response for each operation.

## Implementation steps

1. Add a remote filesystem path helper that verifies the candidate and its nearest existing ancestor resolve inside the canonical workspace root.
2. Apply the physical containment check in `refusedPaths` after its existing lexical check.
3. Add remote navigator tests proving that an outside-pointing symlink is refused before listing and an ordinary in-workspace directory still works.
4. Update `product/specs/file-navigator-tab.md` and `product/specs/remote-server.md` to state that remote navigator paths cannot follow symlinks outside the workspace.

## Tests

- A workspace symlink to an outside directory is refused for `read-directory`, and its entries are not returned.
- An ordinary directory inside the workspace continues to list normally.
- A missing path beneath an outside-pointing symlink is refused based on its nearest existing ancestor.

## Out of scope

Changing how local file navigators display or open symlinks. Replacing filesystem operations with descriptor-relative APIs to eliminate races between validation and use.
