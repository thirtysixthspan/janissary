# Show remote shortcuts in the file navigator header

**Complexity: 4/10** — a small server display-format change and a header presentation adjustment, with focused tests and no filesystem behavior changes.

## Goal

A remote file navigator's metadata header should abbreviate paths using the remote workspace's `$root` and `$workspace` shortcuts when they apply. It should show the remote host as ordinary text styled like the path.

## Approach

Keep `absoluteRoot` as the real remote path for client operations. When building a remote file navigator view, format its displayed root relative to the workspace path supplied by the existing remote manager lookup: the workspace root reads as `$root/`, and paths beneath it read as `$workspace/<name>/<rest>`. Keep local file navigator formatting unchanged. Render the host as regular metadata text instead of the host chip in this header.

## Implementation steps

1. Add remote file navigator root formatting in `src/tab/view.ts`, using POSIX path operations and the existing remote workspace lookup.
2. Render the remote host in `web/src/file-navigator/FileNavigatorHeader.tsx` with the same text styling as the path, and update its tests.

## Tests

- `src/tab/view.test.ts`: cover the remote workspace root, a nested remote path, unchanged absolute root, and local path formatting.
- `web/src/file-navigator/FileNavigatorHeader.test.tsx`: verify the remote host and formatted path render as ordinary location text, with no remote chip.

## Specs and documentation

- Update `product/specs/file-navigator-tab.md` to describe remote shortcut formatting and the plain-text host label.
- Update `product/specs/root-path.md` to include remote file navigator headers among the places that show path shortcuts.
- Update the existing remote file navigator header descriptions in `documentation/user-documentation/advanced-agents/remote-agents.md` and `documentation/user-documentation/tab-types/file-navigator.md`.
- `help.md` does not describe this header behavior and needs no change.

## Out of scope

- Remote shell and agent metadata headers.
- How remote filesystem paths are resolved or used for operations.
- Local file navigator path formatting.
