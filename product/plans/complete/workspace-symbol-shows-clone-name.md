# Workspace symbol shows the clone name

Issue: an agent working in `/Users/…/.janissary/workspace/salih` should show `$workspace/salih` in the metadatabar.

Complexity rating: 3/10

## Goal

A workspaced tab's metadata row currently reads `$workspace` when the tab sits at its clone root and `$workspace/<rest>` inside it. The clone name (the workspace directory's own name) never appears, so a strip of parallel workspaced agents all read identically. Anchor the display on the workspace base directory instead (the tab clone's parent), so the clone root reads `$workspace/<name>` — e.g. `$workspace/salih` — with anything inside it continuing from there (`$workspace/salih/notes/todo`).

## Approach

In `src/tab/view.ts`'s `workspaceCwdDisplay`, derive the anchor from the workspace dir rather than the tab's clone alone:

- `workspace` defined → `base = path.dirname(workspace)`.
- `cwd` below `base` → `$workspace/` + the path below `base` with `/` separators (covers `cwd === workspace`, giving `$workspace/<name>`).
- otherwise → unchanged `undefined` (the tab then shows the ordinary `cwd` abbreviation).

Behavior is identical for local and remote clones — both are direct children of their host's workspace base, and the remote path's `workspaceOf` prefix flows through the same helper unchanged. The sandbox confines a tab to its own clone, so in practice `cwd` below but outside the clone (i.e. in a sibling clone) cannot occur; displaying it would still be coherent rather than harmful.

## Implementation steps

1. Rework `workspaceCwdDisplay` in `src/tab/view.ts` as described; update its explanatory comment.
2. Update the matching comment in `src/protocol/tab.ts`'s `cwdDisplay` field description.
3. Update tests:
   - `src/tab/view.test.ts`: `$workspace` at the clone root → `$workspace/clone`; `$workspace/sub` → `$workspace/clone/sub`; remote prefix → `$workspace/bekir/src`. The "workspace does not cover the cwd" test stays (its cwd is outside the clone and not below the base).

## Tests

- Local clone root: `$workspace/salih` form.
- Path inside a local clone: `$workspace/salih/<rest>`.
- Remote tab via `workspaceOf`: same shape with the remote clone's name.
- Non-workspaced or covering-upless cwd: `cwdDisplay` unset.
- Existing client-side rendering tests (`web/src/shared/AgentTabMeta.test.tsx`, `web/src/harness/HarnessTab.test.tsx`) pass `cwdDisplay` as a prop and need no change; `web/src/App.test.tsx`'s metadata-row test is checked during implementation in case its stubbed view data encodes the old display form.

## Out of scope

- Any interpretation or expansion of `$workspace` back into a real path (unchanged).
- Profile save/load path portability (`portablePath`, `syncedSourcePath`) — unaffected, different consumer.
- The `$root` abbreviation and every other `shorten` consumer.
- The cwd values themselves and anything except the metadata row's display form.

## Specs and docs

- `product/specs/tabs.md`, `product/specs/root-path.md`, `product/specs/remote-server.md`: the workspace symbol's wording updates to `$workspace/<name>` (clone name) with contents beneath it.
- `documentation/user-documentation/getting-started/tabs.md`, `documentation/user-documentation/advanced-agents/remote-agents.md`: same wording update, in place.
- `help.md`: checked at implementation time; no update expected (it does not document the symbol).
