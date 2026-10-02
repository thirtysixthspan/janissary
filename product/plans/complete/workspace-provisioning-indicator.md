# Show workspace provisioning as an animated metadata-row flag

**Complexity: 3/10** — one more entry in the existing tab-flag pipeline, plus one read-only query on `WorkspaceManager`. The flag mechanism, the wire field, the icon registry, the spin animation, and the rendering loop all already exist. No new component, no new wire shape, no protocol message.

## Goal

Provisioning a workspace can be slow because it clones the repository. While a clone is in flight the tab is open but empty, and the metadata row says nothing about why. Show an animated provisioning indicator in the metadata row of agent and harness tabs — local and remote alike — that spins while the workspace is being provisioned and disappears once provisioning is complete.

## Design decisions

- The indicator is a tab flag, `provisioning`, delivered through the existing `TabView.flags` list and rendered by `AgentTabMeta`'s existing flag loop. When the flag drops off the wire, the icon disappears; no client-side state or timer is involved.
- It renders first among the flags, so it sits immediately after the working directory where the eye lands.
- Icon: the existing `syncIcon` (`faArrowsRotate`), animated with the existing `icon-spin` keyframes — the same glyph and spin the editor's sync icon already uses for its own "provisioning workspace" state, so the same motion means the same thing everywhere.
- Tooltip and accessible label: `Provisioning workspace`.
- The flag is derived on the server each time the view is built, never stored on the tab, so there is no copy that can outlive the clone (the same reasoning `RemoteTargetView.provisioning` documents).
- A tab is provisioning when any of these hold and no `harness.provisionError` has been recorded:
  - its harness is still a `provisioning` placeholder (`harness.status === 'provisioning'` — a local `-w` harness or a remote harness before its PTY exists);
  - it is a remote tab whose channel has no workspace directory yet (the same test `remote.provisioning` already uses);
  - it has a local `workspaceDir` whose clone `WorkspaceManager` still has in flight (a local `agent --workspace`, which has no harness status to read).
- A failed provisioning stops the indicator: a harness's `provisionError` suppresses the flag, and a local workspace's in-flight entry is cleared whether the clone succeeds or fails. The local agent failure path broadcasts state so the indicator stops at once rather than when the tab auto-closes.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Flag derivation | `buildTabView` in `src/tab/view.ts` | add the `provisioning` term |
| Remote workspace-absence test | `buildTabView`'s `remote.provisioning` term | same condition feeds the flag |
| In-flight clone tracking | `WorkspaceManager.pending` in `src/workspace/manager.ts` | add a read-only `provisioning(dir)` query |
| Flag rendering | `AgentTabMeta` + `tabFlagDisplay` (`web/src/shared/tab/flag-display.ts`) | add one display entry with a `className` |
| Spin animation | `@keyframes icon-spin` in `web/src/theme.css` | add one rule for the flag's class |

## Proposed changes

1. `src/workspace/manager.ts` — add `provisioning(dir: string): boolean`, true while any pending clone targets `dir`. Keyed by directory rather than label so a second tab sharing the same in-flight clone also shows the indicator.
2. `src/tab/view.ts` — `buildTabViews` passes a `workspaceProvisioning` lookup (`managers.workspace.provisioning`) as a new optional trailing parameter of `buildTabView`. `buildTabView` computes `remoteProvisioning` once (reused by the existing `remote.provisioning` field) and prepends `'provisioning'` to `flags` via a small `provisioningFlag` helper implementing the rule above.
3. `src/profile/new-agent.ts` — the local workspace failure callback emits a `dirty` state event after printing the failure, so the indicator stops immediately.
4. `src/protocol/tab.ts` — extend the `flags` comment to name `provisioning`.
5. `web/src/shared/tab/flag-display.ts` — add `provisioning: { icon: syncIcon, label: 'Provisioning workspace', className: 'tab-flag--provisioning' }`.
6. `web/src/theme.css` — spin the flag's icon with the existing `icon-spin` animation.

## Tests

`src/workspace/manager.test.ts` (or the existing manager test file):

- `provisioning(dir)` is true while the clone is in flight and false once it resolves or rejects.

`src/tab/view.test.ts`:

- includes `'provisioning'` first in flags for a harness tab whose status is `provisioning`
- omits it once the harness has a `provisionError`
- includes it for a remote tab whose channel has no workspace yet, and omits it once the channel reports one
- includes it for a local workspaced tab whose clone is still in flight, and omits it once the lookup reports done

`web/src/shared/AgentTabMeta.test.tsx`:

- renders the provisioning flag with the accessible label `Provisioning workspace` and the spinning class

## Out of scope

- Progress percentages or clone phase text — the indicator is binary.
- Shell tabs, plugin tabs, editor tabs (the editor already has its own sync provisioning icon).
- The tab strip: the indicator lives in the metadata row only.
- A remote agent whose launch fails keeps its indicator until its tab auto-closes, because the channel offers no failure state beyond its absent workspace.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: run `agent foo --workspace` and `harness claude -w`, and confirm the metadata row shows a spinning arrows icon with the tooltip "Provisioning workspace" until the clone lands, then the icon disappears. Repeat with `agent bar on <host>` for a remote tab.
