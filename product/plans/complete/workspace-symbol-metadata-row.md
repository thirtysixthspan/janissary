# $workspace symbol in the tab metadata row

Issue: use $workspace as a symbol to mean the workspace path in the metadata bar — for example
`$workspace/research` instead of `/Users/…/.janissary/workspace/research` — working on local and
remote harnesses and agents.

Complexity: 4/10

## Goal

A workspaced agent/harness tab's metadata row shows nothing but its workspace today: a local clone
reads `$root/workspace/<name>`, while a remote tab shows the far host's absolute clone path raw.
Introduce the display symbol `$workspace` for the workspace prefix: the working directory equals
the workspace dir → `$workspace`, and any path inside it → `$workspace/<rest>`, for both local and
remote workspaced tabs.

## Approach

- Server (`src/tab/view.ts`): `buildTabViews` gains the remote workspace lookup
  (`managers.remote.workspaceOf(label)`) alongside the tab's local `workspaceDir`; a new
  `cwdDisplay` per tab is computed by a small helper — `$workspace` when cwd equals the workspace
  root, `$workspace/<rest>` when it sits inside it, otherwise the existing `shorten(cwd)`. The
  `cwd` field itself stays exactly as it is so every other consumer (drag path joining, sidebar,
  transcript lines, connections panel) keeps its current semantics.
- Protocol: `TabView.cwdDisplay?: string` (`src/protocol/tab.ts` types already carry `TabView`
  though built in `src/tab/view.ts`; add the optional field to the type).
- Web (`web/src/shared/AgentTabMeta.tsx`): the `.tab-cwd` span renders `cwdDisplay ?? cwd`. Since
  all four tab kinds (agent, inactive split agent, harness, shell) funnel through `AgentTabMeta`,
  one change covers them all.
- No client behavior besides display: RemoteChip unchanged, workspaced flag unchanged.

## Tests

- `src/tab/view.test.ts`: `$workspace` for an exact local workspaceDir prefix; `$workspace/<rest>`
  when cwd moves inside the clone; unchanged abbreviation for non-workspaced tabs; remote tab
  shows `$workspace` via `workspaceOf`, and falls back to the previous abbreviation if the remote
  entry is gone.
- `web/src/shared/AgentTabMeta.test.tsx`: `cwdDisplay` wins over `cwd`; absent `cwdDisplay` keeps
  the current render.
- One `HarnessTab.test.tsx` sampling that the display threads through the harness body.

## Out of scope

- Transcript prompt lines, connections panel, navigator root, and command parsing keep `$root` and
  abbreviated paths as-is; `$workspace` is a metadata-row display symbol.
- Expanding `$workspace` back to a path (no new user-facing syntax).

## Specs / docs

`product/specs/tabs.md` (metadata row: the display symbol), `product/specs/remote-server.md`
(remote working directory now reads `$workspace`), `product/specs/root-path.md` (add `$workspace`
beside `$root`'s contract). Help/user docs only if they describe the metadata-row cwd.
