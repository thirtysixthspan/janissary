# Show the remote host in interactive command metadata

**Complexity: 2/10** — the remote target already exists on each tab and the shared metadata component already renders it. The interactive shell layer only needs to preserve that value through its existing component boundary.

## Goal

When a remote agent runs an interactive command such as `htop`, keep the remote host chip visible in the full-tab terminal's metadata row, with the same host text and destination tooltip shown before and after PTY takeover.

## Approach

Pass the tab's existing `remote` target from `ShellTabLayer` into `ShellTab`, then forward it to `AgentTabMeta`. This reuses the established rendering and accessibility behavior without changing the protocol or duplicating host formatting.

## Implementation steps

1. Extend `ShellTab` with an optional remote target and pass it to `AgentTabMeta`.
2. Pass each interactive tab's remote target from `ShellTabLayer` into `ShellTab`.

## Tests

- Add a `ShellTab` render test proving a supplied remote target produces the host chip and full destination tooltip.
- Add a `ShellTabLayer` test proving the active tab's remote target reaches `ShellTab`.

## Spec updates

- Update `product/specs/tabs.md` to state explicitly that PTY takeover retains the remote host chip.

## Docs

- Update `documentation/user-documentation/getting-started/tabs.md`, which already describes metadata rows, to explain the remote host chip and its behavior during interactive commands.
- `help.md` does not describe metadata rows or remote host chips, so no update is needed there.

## Out of scope

- Remote provisioning, transport, protocol, and server state.
- Metadata styling or changes to agent and harness metadata.
- Interactive terminal controls and lifecycle.
