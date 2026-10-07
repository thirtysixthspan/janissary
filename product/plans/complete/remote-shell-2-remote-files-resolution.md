# Remote shell 2 — `files` resolves on the remote host from remote tabs

**Complexity: 4/10** — one remote protocol field persisted through attach, plus a contained change to `files` path resolution with new refusals; it spans the far side, the channel entry, session records, and the command.

Run order: 2 of 8 in the remote shell series. Depends on nothing; it can land before or after plan 1. Plans 5 and 7 rely on it for remote shells.

A bare `files` typed in a remote agent or harness tab uses that tab's cwd as a *local* path (`resolveCwd` in `src/file-navigator/open-command.ts:19-30`), and `files <path> in <remote tab>` opens a root outside the remote workspace unchecked. This plan makes `files` resolve on the remote host from any remote tab, bounded to the provisioned workspace. Both `files in <label> <path>` and `files <path> in <label>` select the named tab; remote shell tabs get this for free once they exist.

## Design decisions

Established behavior:

- `files in <label>` and the metadata-row folder button on a remote tab use that tab's remote workspace and SSH channel through `openRemoteTree`.
- The folder button opens or retargets at the remote workspace root (`openRemote` in `src/file-navigator/open.ts:52-73`).
- A remote agent's `cwdOf` tracks its remote cwd (`onPwd`, `src/shell/manager.ts`). A remote harness's cwd becomes its workspace root once ready and is not tracked after that (`src/harness/tab-spawn.ts`).
- While either is provisioning, its cwd is still the local launch directory, and `RemoteManager.workspaceOf` is undefined.

User decisions:

- A bare `files` from any remote tab (shell, agent, or harness) uses the tab's remote cwd while that is inside the workspace, and the workspace root otherwise.
- From a remote tab whose workspace is still provisioning, `files` answers `The remote workspace is not ready yet.` and opens nothing.
- In `files <path>`, relative paths resolve against that remote cwd, `~` expands against the remote user's home, and `$root` expands to the remote workspace root.
- A result outside the workspace is refused with `"<path>" is outside the remote workspace <workspace>.` The same check now applies to `files <path> in <remote tab>`.
- The folder button is unchanged.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `files` command and remote-root selection | `src/commands/files.ts`; `resolveCwd` and `openRemoteTree` in `src/file-navigator/open-command.ts` |
| Path expansion | `expandUserPath(input, { root, home })` in `src/paths.ts:14` |
| Remote workspace lookup | `RemoteManager.workspaceOf` in `src/remote/manager.ts` |
| Far-side home precedent | the `home` context in `src/remote/serve-root-settle.ts:18` |
| `workspace-ready` frame and its decoder | `src/remote/protocol-frames.ts:138`; `decodeWorkspaceReady` in `src/remote/frame/decode-lifecycle.ts` |
| Channel entry fed by `workspace-ready` | the `workspace-ready` case in `src/remote/entry-factory.ts`; `RemoteEntry` in `src/remote/attach.ts`; `RemoteLaunchHandlers.onReady` in `src/remote/manager.ts` |
| Reattach without `workspace-ready` | `settleResume` in `src/remote/resume.ts`; `RemoteSessionRecord` in `src/sessions/store.ts`; `recordOf` in `src/sessions/snapshot.ts` |
| Far-side workspace provisioning reply | `src/remote/serve-provision.ts` |

## Proposed changes

**Remote home.** These pieces carry the remote user's home from the far side to the tab:

- `workspace-ready` gains `home`, which the far side fills from `os.homedir()` in `serve-provision.ts`, and `decodeWorkspaceReady` accepts it.
- `RemoteLaunchHandlers.onReady` passes it on, the `workspace-ready` case in `entry-factory.ts` stores it on `RemoteEntry`, and `RemoteManager` exposes it as `homeOf(label)`.
- A reattach gets no `workspace-ready`, so `RemoteSessionRecord` gains an optional `home`, written by `recordOf` and validated in `store.ts`, and `settleResume` restores it onto the entry.

Bump `REMOTE_PROTOCOL_VERSION` (`src/remote/protocol.ts:166`) by one, with an entry in the version-history comment above it.

**Resolution.** `open-command.ts` is at about 164 code lines, so put the remote logic in a new `src/file-navigator/remote-cwd.ts` and call it from `resolveCwd`. It applies to any source tab with a `remote` target, whether that is the issuing tab or one named by `in`:

- If `RemoteManager.workspaceOf` is undefined, it answers `The remote workspace is not ready yet.` and opens nothing.
- Otherwise the base directory is the tab's `cwdOf` when that is inside the workspace, and the workspace root otherwise.
- For a path argument, `expandUserPath` gets `{ root: workspace, home: RemoteManager.homeOf(label) }`, and a relative result joins the base with `path.posix`. If `home` is unknown, `~` stays unexpanded and the containment check refuses it.
- The containment check uses `path.posix` normalization, and a result outside the workspace answers `"<path>" is outside the remote workspace <workspace>.`

The result keeps `remote` set, so `openRemoteTree` is used as it is for `in`.

Update `product/specs/file-navigator-tab.md`, `product/specs/remote-server.md` (the bare-`files` rule, remote `~` and `$root`, and the outside-workspace refusal), and the `files` entry in `help.md`.

## Tests

- `src/file-navigator/remote-cwd.test.ts` and `open-command.test.ts`:
  - bare `files` from a remote agent and a remote harness;
  - the provisioning refusal;
  - a cwd outside the workspace falling back to the root;
  - relative paths, remote `~`, and `$root`;
  - the outside-workspace refusal through both the issuing tab and `in`.
- `src/remote/protocol.test.ts`: `home` decodes on `workspace-ready`, and the version check. `src/remote/manager.test.ts`: `homeOf`.
- `src/remote/serve-provision.test.ts`: `home` is sent.
- `src/remote/resume.test.ts`, `src/sessions/store.test.ts`, and `src/sessions/agent-roundtrip.test.ts`: `home` persists and survives a reattach.

## Out of scope

Remote shell tabs, which are plans 3 to 8. `files on <address>` without an existing remote tab. Arbitrary remote paths outside the workspace. The folder button's behavior. Restoring remote navigators.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually launch `agent x on <address>`, `cd src` in it, and run bare `files`; confirm a remote tree at `src`. Run `files ~/…` for a path inside the workspace, then one outside it, and confirm the refusal text. Relaunch, reattach the agent, and confirm `files ~/…` still expands against the remote home.
