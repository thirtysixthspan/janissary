# Restrict remote PTY adoption to the host's reattach context

**Complexity: 6/10**

## Goal

Only a host-authorized remote adopt launch can bind a plugin terminal to an existing remote PTY id.

## Approach

Keep the recorded id in host-owned launch and tab-opening state. Validate the adopt request against the id supplied to the plugin's reattach callback, then inject that id into the remote terminal registration performed by the host. Do not expose an id-selection field through the general plugin terminal resource.

## Implementation steps

1. Remove `recordedId` from the public `TabPluginTerminalOptions` and from `spawnShell`'s general start data.
2. Carry the authorized process id through `TabPluginHost.reattach`, `invokePlugin`, and `launchCapabilities`; reject adopt requests whose id differs from the reattach record.
3. Add an internal recorded id to the host-owned plugin tab preset, then pass it through `withResources` and `TabManager.spawnRemoteTerminal` to `registerRemotePty`.
4. Test that ordinary plugin terminal creation cannot choose an id and a matching reattach adoption still binds the recorded id.
5. Update the tab plugin API documentation to explain the host-enforced boundary.

## Tests

- Extend plugin launch and remote terminal tests for rejection of unauthorized or mismatched ids and acceptance of the matching recorded id.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Spec

No user-facing behavior changes; the existing remote session specs remain accurate.

## Out of scope

Changing the PTY id format or process state protocol.
