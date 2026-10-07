# Preserve the shell identity across repeated remote reattachments

**Complexity: 4/10** — session identity needs to survive the temporary SSH prompt tab, with focused coverage in attach and session snapshot tests.

## Goal

After a detached remote shell is attached, detached again, and attached once more, restore one shell tab under its existing label and close the temporary SSH prompt tab. Also recognize detached records already written with the temporary prompt label as an agent launch, so an in-flight user record recovers on its next attach.

## Root cause

Attaching a shell creates a temporary remote agent tab named `<shell>-attach` to render SSH prompts. The remote entry keeps that temporary label as its workspace label after the real shell is restored. The next session snapshot therefore looks for a launch process under the wrong label and records the session as an agent. A later attach treats the shell session like an agent launch and leaves both the prompt tab and the shell tab open.

## Approach

Keep the stable workspace label used by the remote file cache separate from the live launch label used to identify the tab that owns the remote session. Initialize both when a remote connection starts, preserve the workspace label from the saved record across an attach, and promote the launch label to the restored shell before closing the prompt tab. Session snapshots and live-session actions use the launch label; workspace cache cleanup continues to use the stable workspace label.

## Implementation steps

1. Add an optional live launch label to remote entries and a RemoteManager method that promotes it only to an existing alias.
2. Carry the saved workspace label through the attach handshake so cache identity remains stable.
3. Promote the launch label to the restored shell before closing a shell attach bridge; use the launch label for session snapshots, live attach lookup, and live termination.
4. Recognize legacy records whose processes are all remote shells even when the stored launch kind was changed to agent by the earlier attach.
5. Add regression tests for launch-label promotion, legacy-record recovery, and recording the restored shell as the session owner while preserving workspace identity.
6. Update the sessions and remote-server specs to describe stable shell identity across detach and attach cycles.

## Tests

- `src/sessions/attach.test.ts` verifies a shell attach promotes its restored shell label before closing the prompt bridge.
- `src/sessions/snapshot.test.ts` verifies a reattached shell remains a shell session with its stable workspace label.
- `src/remote/manager.test.ts` verifies launch-label promotion accepts only a label already attached to the entry.

## Out of scope

- Changes to SSH authentication or remote process lifecycle.
- Changes to the remote shell's PTY, cwd, offline mode, or marker nonce.
- Public help and user documentation; the user-visible behavior is already documented.
