# Remote shell 4 follow-up — preserve plugin terminal args and environment

**Complexity: 5/10** — the existing remote spawn protocol already carries terminal launches, but this fix must extend its versioned frame, decoder, process launch, and focused tests without changing other remote PTY callers.

## Goal

Make `spawnTerminal` behave consistently when the host routes it to a remote workspace: preserve the plugin's shell arguments and environment overrides on the remote host.

## Approach

Carry shell launch options and environment overrides as optional `spawn` fields. Validate them at the protocol boundary, use them in the remote `spawnPty` call, and retain the zsh hooks environment precedence. Bump the remote protocol version because an older peer would silently ignore these launch options.

## Implementation steps

1. Extend the `spawn` frame and decoder with a `launch` object matching the `PtyLaunch` shape and a string-valued `env` map; reject malformed values. Bump `REMOTE_PROTOCOL_VERSION`.
2. Forward `options.shell`, `options.args ?? []`, and `options.env` from `spawnRemotePluginTerminal` through `RemotePtyOptions` and `createRemotePtySession`.
3. In `RemoteProcesses.spawnPty`, pass the launch selection and merge the plugin environment with the far-side harness environment. When zsh hooks are requested, use the zsh hook launch and merge host-managed startup values over the plugin's environment.
4. Keep existing callers unchanged when the new fields are absent. Do not persist shell args or environment in process state unless a concrete attach or replay path needs them; a running process already owns its environment and argv.

## Tests

- `src/tab/remote-plugin-terminal.test.ts`: forwards shell launch options and env values, while preserving the existing zsh hook metadata.
- `src/remote/protocol.test.ts`: round-trips the new optional spawn fields.
- `src/remote/protocol.test.ts` or its spawn decoder tests: rejects invalid launch values, non-string args, and invalid env maps.
- `src/remote/serve-processes.test.ts`: verifies launch and environment reach `spawnPty`, including that host-managed zsh hook variables take precedence over plugin values.
- Existing plugin terminal and remote spawn tests continue to cover local behavior and spawn frames without these fields.

## Out of scope

Changing remote workspace confinement, shell cwd validation, plugin resource permissions, or the local spawn path.

## Verification

Run `./scripts/run.mjs check-diff` after each implementation step.
