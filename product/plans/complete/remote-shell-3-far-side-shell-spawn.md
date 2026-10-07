# Remote shell 3 — far-side interactive zsh spawn

**Complexity: 4/10** — new optional fields on remote spawn and process-state frames, their decoders, a far-side interactive spawn that reuses the harness sandbox, and shell-specific exit routing; all on the remote protocol surface, with no tab yet.

Run order: 3 of 8 in the remote shell series. Depends on plan 1, which provides the host-owned zsh startup module. Plan 4 uses it.

`janus remote-serve` can start a PTY only as a harness command run through `$SHELL -c` (`RemoteProcesses.spawnPty` in `src/remote/serve-processes.ts:88`), always in the workspace root, and it reports no shell identity. A remote shell tab needs an interactive zsh started in a requested directory inside the workspace, with the status hooks authenticated by a per-shell nonce, and needs enough process state for a later attach to rebuild the tab. This plan adds that to the protocol and the far side. Nothing local sends it yet.

## Design decisions

- The remote applies its own sandbox policy: active on macOS, inactive elsewhere. A remote zsh gets the same `{ workspaceDir, offline, tokens }` confinement and credential injection a remote harness PTY gets.
- The remote peer owns its own zsh startup directory for its lifetime, and the nonce travels on the spawn frame.
- A requested cwd outside `workspaceDir` falls back to `workspaceDir`, matching the local rule that a terminal only starts inside its bound.
- A shell process has to be told apart from an inline terminal card, which is also a `pty` with an `agentName` (`openInlinePty` in `src/pseudoterminal-manager.ts`). So the discriminator is the presence of `shell`, not the PTY mode.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Far-side PTY spawn and sandbox | `RemoteProcesses.spawnPty` in `src/remote/serve-processes.ts:88-139`; `spawnPty` with `launch`/`extraEnv` in `src/pty.ts` |
| Spawn-failure reply | `src/remote/serve.ts:205-210` (answers `exit 1`) |
| Spawn frame and decoder | `src/remote/protocol-frames.ts:65-86`; `decodeSpawn` in `src/remote/frame/decode-lifecycle.ts` |
| Process-state report and decoder | `spawnFrameState` in `src/remote/process-state.ts`; `decodeProcessState` in `src/remote/frame/decode-sessions.ts` |
| Owner exit routing | `SessionRouter.exit` in `src/remote/channel/sessions.ts` |
| Startup environment | `src/shell/zsh-startup/` (from plan 1) |
| Peer shutdown | `shutdown` in `src/remote/serve.ts:83` |

## Proposed changes

The `spawn` client frame gains an optional `cwd` and an optional `shell: { nonce }`, and `decodeSpawn` accepts both, validates the nonce format, and permits shell metadata only for PTY spawns. The decoder returns only the validated nonce from the shell object. When a spawn carries `shell`, `RemoteProcesses.spawnPty` treats it as an interactive zsh:

- it calls `spawnPty` with `launch = { shell: 'zsh', args: [] }`;
- it passes the peer's startup environment for the nonce as `extraEnv`;
- it applies the same sandbox argument a harness PTY gets, with the frame's `offline`;
- its cwd is the frame's `cwd` when that is inside `workspaceDir`, and `workspaceDir` otherwise.

The peer acquires its `ZshStartupDirectory` on the first shell spawn and releases it when `serve.ts` shuts the remote process table down. A spawn without `shell` keeps today's launch path. If zsh is missing, `spawnPty` throws and the existing reply answers `exit 1`. Plan 5 turns that into a user-facing line.

`process-state` entries for a shell gain `shell: { nonce }`, `offline`, and the spawn `cwd`. Update `spawnFrameState` and `decodeProcessState`. Do not carry over the decoder's existing silent drop of `autoResume`; fix it while editing.

`SessionRouter.exit` reports a shell process's exit through the existing owner termination callback, while passing the harness discriminator only for actual harness processes. A standalone shell falls back to its launch tab label and receives the existing `Remote shell` termination wording.

Bump `REMOTE_PROTOCOL_VERSION` (`src/remote/protocol.ts:166`) by one, with an entry in the version-history comment above it. Note `shell` as a remote process kind in `product/specs/remote-server.md`.

## Tests

- `src/remote/serve-processes.test.ts`:
  - a shell spawn starts zsh with the startup environment, the nonce, the sandbox, and the offline mode;
  - its cwd falls back when outside the workspace;
  - a spawn without `shell` is unchanged;
  - the startup directory is removed on shutdown.
- `src/remote/protocol.test.ts`, where the frame decoders are tested: the new fields, an invalid nonce rejected, and `autoResume` preserved.
- A new `src/remote/process-state.test.ts`: shell state is reported.
- `src/remote/channel/sessions.test.ts`: a shell exit reaches termination cleanup with the harness discriminator false, while a harness exit keeps it true.
- `src/remote/protocol.test.ts`: the version check.

## Out of scope

Anything local that sends a shell spawn (plans 4 and 5). Session-record persistence of shell state (plan 8).

## Verification

Run `$janissary/scripts/run.mjs check-diff` and the feature PR hard-check gate. No local manual path reaches this yet. Confirm the existing remote harness launch and attach tests still pass against the new peer protocol.
