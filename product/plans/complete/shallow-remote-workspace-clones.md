# Shallow remote workspace clones

Issue: remote workspaces should be similarly cloned as local workspaces.

Complexity rating: 3/10

## Goal

`shallow-workspace-clones` made local shell clones depth 1 and local harness clones depth 10, both keeping every branch. It left remote workspaces (`shell … on <address>`, `harness … on <address>`) as full clones, because the remote host makes that clone and doesn't know which kind of tab asked for it. Close that gap: a remote shell's workspace clones one commit deep, a remote harness's clones ten deep, and both keep every branch, exactly as on this machine.

## Approach

The launching side already knows which kind of tab it's opening, so it tells the host. The `provision` frame gains an optional `depth`. The host clones with that depth plus `--no-single-branch`, the same options a local workspace clone uses. A frame without `depth` gets a full clone, as today.

The depth values and the "depth plus every branch" rule get one definition, in `src/workspace/clone-depth.ts`. The two option objects become two depth constants and one helper:

- `SHELL_CLONE_DEPTH = 1` and `HARNESS_CLONE_DEPTH = 10`.
- `workspaceCloneOptions(depth)` returns `{ depth, allBranches: true }`.

The local callers (`startClone` in `src/plugins/launch-tab.ts`, `resolveLaunchDir` in `src/harness/launch-dir.ts`) call `workspaceCloneOptions` with their depth. The remote host calls it with the depth the frame carries. So local and remote clones can't drift apart.

On the launching side, the depth follows the path the other launch details already take:

- `startRemoteLaunch` (`src/harness/remote-launch.ts`) takes an optional `depth`. It passes `{ depth }` to `RemoteManager.create`'s options when one is given.
- `RemoteManager.create` passes it to `createRemoteEntry`. The entry factory adds `depth` to the `provision` frame it sends after the handshake. An attach never sends `provision`, so a reconnect or restore is untouched.
- `startRemoteTab` (the remote harness path) passes `HARNESS_CLONE_DEPTH`. `launchRemotePluginTab` (the remote shell path) passes `SHELL_CLONE_DEPTH`. `startSshBridge` only ever attaches, so it passes none.

On the host, `decodeProvision` accepts `depth` only as a positive whole number and refuses the frame as malformed otherwise. `RemoteServer.provision` hands `frame.depth` to `provisionRemoteWorkspace`. That calls `workspaces.create(label, token, workspaceCloneOptions(depth))` when a depth came, and `workspaces.create(label, token)` when none did.

`REMOTE_PROTOCOL_VERSION` moves from 34 to 35. The rule in `src/remote/protocol.ts` covers this case: a field one end fills in and the other is expected to honor is part of the contract. A version-34 host would drop `depth` and make a full clone while both ends looked healthy. The new version's comment says that.

Remote agent runs (`agent … on <host>` with no established workspace) send no depth. They get a full clone, which matches a local agent run's workspace (`src/agent/workspace-execution.ts`). That one was never made shallow.

## Implementation steps

1. `src/workspace/clone-depth.ts`: replace `SHELL_WORKSPACE_CLONE`/`HARNESS_WORKSPACE_CLONE` with `SHELL_CLONE_DEPTH`, `HARNESS_CLONE_DEPTH`, and `workspaceCloneOptions(depth)`, keeping the module comment. Update `src/plugins/launch-tab.ts` and `src/harness/launch-dir.ts` to call `workspaceCloneOptions(...)`.
2. `src/remote/protocol-frames.ts`: add `depth?: number` to the `provision` frame, and extend the frame's comment to say what `depth` means and that a frame without it gets a full clone. `src/remote/frame/decode-provision.ts`: decode it. The positive-whole-number check already exists as a private `positiveInteger` in `src/remote/frame/decode-lifecycle.ts`. It moves to `src/remote/frame/decode-shared.ts`, which holds the field checks the decoders share, and both decoders import it from there.
3. `src/remote/protocol.ts`: bump `REMOTE_PROTOCOL_VERSION` to 35 with a version-35 comment.
4. `src/remote/serve.ts` and `src/remote/serve-provision.ts`: carry `frame.depth` through to `workspaces.create`.
5. `src/remote/entry-factory.ts` and `src/remote/manager.ts`: accept `depth` in the create options and send it on `provision`.
6. `src/harness/remote-launch.ts`: `startRemoteLaunch` takes `depth`; `startRemoteTab` passes `HARNESS_CLONE_DEPTH`. `src/plugins/launch-tab-remote.ts`: pass `SHELL_CLONE_DEPTH`.

## Tests

- `src/remote/protocol.test.ts`: the version pin moves to 35. A `provision` frame with `depth: 10` decodes with its depth. `depth` of `0`, `-1`, `1.5`, and `"1"` are each refused as malformed.
- `src/remote/serve-provision.test.ts`: with a depth, `create` gets `{ depth: 1, allBranches: true }` as its third argument. Without one, it is called with two arguments.
- `src/remote/manager.test.ts`: `rootHarness` takes create options. A launch created with `{ depth: 10 }` sends `"depth":10` on `provision`. The existing no-origin launch sends no `depth`.
- `src/harness/remote-launch.test.ts`: `startRemoteLaunch` with a depth passes `{ depth }` to `remote.create`. Without one, it passes no options.
- `src/plugins/launch-tab-remote.test.ts`: the remote shell launch passes `{ depth: 1 }` to `remote.create`.
- `src/harness/manager.test.ts`: `harness claude on …` passes `{ depth: 10 }` to `remote.create`.
- `src/harness/launch-dir.test.ts` and `src/plugins/launch-tab.test.ts` keep asserting the literal local options, so they pin that the refactor left local clones unchanged.

## Out of scope

- Agent-run workspaces, local or remote. Both stay full clones, as they are today.
- The remote project root clone made after an accepted clone offer. That is the host's checkout of the project, not a disposable workspace.

## Specs and docs

- `product/specs/workspaced-agent.md`: "Remote workspaces" says a remote clone is shallow to the same depth as a local one, replacing the sentence saying it keeps full history.
- `product/specs/shell-tab.md` and `product/specs/harness.md`: drop "local" from the shallow-clone sentences.
- `product/specs/remote-server.md`: a protocol-version-35 paragraph after the version-33 one.
- `ai/tasks/workspace/prepare-workspace.md` already describes every Janissary shell and harness workspace as shallow, which is now true remotely too. No change.
- `help.md` and `documentation/user-documentation/`: checked. The docs quote the version-mismatch message only with placeholders, so no update.
