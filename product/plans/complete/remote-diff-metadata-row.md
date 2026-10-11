# Align remote diff workspace metadata

**Complexity: 5/10** — the change-set result already crosses the remote filesystem boundary, so it can carry the workspace branch without a new capability. The server then publishes that value in the diff payload, and the client renders host, path, and branch in the file navigator's left-aligned metadata layout.

## Goal

Show the remote host, diff root, and checked-out branch together on the left side of a remote workspace diff tab's metadata row, in the same order and layout as a remote file navigator.

## Approach

Add an optional branch to successful change-set results and read it from the repository where the diff runs. Carry it into the diff payload and render the metadata in host, path, branch order. Keep the field optional so older peers and detached or non-repository states remain valid. Increment the diff payload schema version for the additive client payload field.

## Implementation steps

1. Include the checked-out branch in successful `readChangeSet` results and validate the optional field at the remote result boundary.
2. Carry the branch into `DiffPayload`, increment its schema version, and render host, root, and branch in a left-aligned metadata group matching the file navigator header.
3. Update the diff tab spec to describe the metadata order and alignment.

## Tests

- `src/plugins/diff/change-set.test.ts`: successful reads include the checked-out branch; result validation accepts an optional string branch and rejects a malformed branch.
- `src/plugins/diff/remote-change-set.test.ts` and `src/plugins/diff/session-context.test.ts`: the remote reader accepts and the session publishes branch metadata.
- `web/src/plugins/diff/DiffTab.test.tsx`: host, path, and branch render in that order in the left metadata group; project-root diff metadata remains branch-free.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing diff tab labels or titles.
- Showing branch metadata on the project-root diff tab.
- Resolving the separate backlog item about the diff tab label.
- Changing user documentation; this changes contributor-visible metadata in a feature that public docs do not describe at this level.
