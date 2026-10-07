# Remote shell 6 — remote metadata in the shell tab

**Complexity: 3/10** — client-only plumbing: publish two existing components through the plugin client API, pass the tab's remote target and session control into plugin bodies, and render them in `ShellTabMeta`.

Run order: 6 of 8 in the remote shell series. Depends on plan 5, which produces remote shell tabs. It can land in parallel with plan 7.

Remote agent and harness tabs show a host chip, a provisioning indicator, and an attach/detach control in their metadata row. A remote shell tab from plan 5 shows none of these, because plugin bodies receive no remote target and `ShellTabMeta` can import only the plugin client API. This plan gives the shell tab the same affordances.

## Design decisions

- A remote shell's metadata row matches a remote harness's: the same host chip, provisioning indicator, and attach/detach control, rendered by the same components.
- The shell's ➕ is already dimmed with `Waiting for the workspace` while its payload is provisioning, and that is unchanged.
- `PluginBody` keeps its capabilities object stable on purpose, so the remote props are memoized by value.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Remote target on the tab view | `RemoteTargetView` (including `provisioning`) and `TabView.remote` in `src/protocol/tab.ts` |
| Chip, session button, and control | `RemoteChip.tsx`, `RemoteSessionButton.tsx`, and `remoteSessionControl` in `web/src/shared/` |
| How a harness renders them | `web/src/harness/HarnessTab.tsx:67-80` |
| Plugin body and its callers | `web/src/plugins/PluginBody.tsx`; `PluginTabLayer.tsx:45`; `DockedPluginBody.tsx:36` |
| Plugin client API | `web/src/plugins/api.ts` (it already exports `ConnectionPlug` and the attach/detach icons) |
| Shell metadata row | `web/src/plugins/shell/ShellTabMeta.tsx` |

## Proposed changes

Publish `RemoteChip` and `RemoteSessionButton` through `web/src/plugins/api.ts`. Pass `TabView.remote`, and a session control built with `remoteSessionControl`, from both `PluginBody` callers into the plugin's client capabilities. `PluginBody.tsx` is at about 165 code lines, so put the memoized remote plumbing in a small hook beside it (`usePluginRemote.ts`). `ShellTabMeta` renders the host chip, provisioning indicator, and attach/detach control when `remote` is present, in the same order and with the same titles as `HarnessTab`. A local shell renders exactly as before.

Document the newly published components and the remote client capability in `documentation/developer-documentation/tab-plugins.md`, with a changelog entry. Describe the remote shell's metadata row in `product/specs/shell-tab.md`.

## Tests

- `web/src/plugins/shell/ShellTabMeta` tests: the chip and control render for a remote payload and not for a local one; the control offers attach while reconnecting and detach while healthy.
- The `usePluginRemote` hook tests: the capabilities identity is stable across equal remote values.

## Out of scope

Behavior of attach and detach for shells across relaunch, which is plan 8. Any server change.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually open `zsh on <address>` and confirm the host chip, the provisioning indicator until ready, and a working detach followed by attach.
