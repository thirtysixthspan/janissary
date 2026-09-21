# Reattach a detached remote agent shell

Issue: when an agent is detached, its remote shell ends and reattaching reports `Remote shell on <host> ended — start a new agent or shell to continue.`

Complexity: 3/10

## Goal

Keep a detached remote agent's persistent shell alive and reconnect the restored tab to that same shell.

## Approach

The reattach flow already records the remote shell's process ID and gives it to the restored tab. Make that handoff explicit in the remote shell adapter so an adopted process is attached without issuing another spawn request. A new shell still uses the existing spawn behavior.

## Implementation steps

1. Extend the remote shell adapter with an adopted-shell mode that registers the saved process ID but does not send a spawn frame.
2. Have `ShellManager` select that mode only when its saved adoption belongs to the tab's current remote session.
3. Add regression coverage for both the adapter and the manager's restored-shell path.

## Tests

- An adopted remote shell accepts input on the saved ID without spawning another remote process.
- A restored remote agent passes adopted mode to its shell adapter.
- A new remote agent shell still sends its spawn frame.

## Specs / docs

Update `product/specs/sessions-tab.md` to state that a restored remote agent continues through its retained shell. No existing help or public documentation describes this internal restoration detail.

## Out of scope

Remote-server process management, SSH authentication, and the separate harness-tab shutdown finding.
