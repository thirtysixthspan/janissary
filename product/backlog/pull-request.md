<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve plugin shell arguments and environment when a terminal is routed remotely.

Existing Issue: The local `spawnTerminal` contract accepts `args` and `env`, but `spawnRemotePluginTerminal` forwards neither, so a matching remote workspace silently starts a different shell invocation with a different environment. Severity: 6/10

Existing Risk: 5/10 - Plugins that depend on startup flags or environment variables behave differently solely because their workspace is remote, which can hide configuration failures or omit required credentials and settings.

Proposal Risk: 2/10 - Carrying both options through the versioned spawn contract makes local and remote resource calls consistent, while validation and existing protocol version checks bound compatibility risk.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1578: preserve plugin terminal args and env on remote spawns". `TabPluginTerminalOptions` in `src/plugins/api.ts` defines `shell`, `args`, `env`, and `zshHooks`; local `spawnPluginTerminal` honors `args` and `env`, while `spawnRemotePluginTerminal` in `src/tab/remote-plugin-terminal.ts` currently sends only `program`, `command`, `cwd`, `offline`, and the zsh hook nonce to `PseudoterminalManager.registerRemotePty`. Extend the remote spawn contract in `src/remote/protocol-frames.ts` and its decoders to carry the shell argv and extra environment, bump `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts`, and thread both values through `RemotePtyOptions`/`createRemotePtySession`, `src/remote/serve-processes.ts`, and `spawnPty`'s launch arguments/environment. Keep the existing zsh hook environment merge semantics, with host-managed startup variables taking precedence over plugin-provided values. Preserve any fields in process state only where attach/replay needs them. Add focused coverage in `src/tab/remote-plugin-terminal.test.ts`, remote frame codec tests, and `src/remote/serve-processes.test.ts` to prove non-empty `args` and `env` reach the far-side PTY and remain version-checked; retain the current empty-args shell path and local `plugin-terminals.test.ts` behavior.
