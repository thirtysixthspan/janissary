# Fix shell-launched session attachment

**Complexity: 5/10**

## Goal

Attaching or relaunching a remote shell session restores its recorded shell tabs without leaving an ordinary agent tab behind or renaming the launching shell.

## Approach

Use a temporary remote agent tab only as the SSH prompt surface while the saved session resumes. Restore every shell process through the shell plugin's reattach handler, then close the temporary bridge once restored tabs hold the channel. Keep the existing agent and harness attach paths unchanged.

## Implementation steps

1. In `src/sessions/attach.ts`, give a shell-launched session a collision-safe temporary bridge label and close the bridge after shell tabs are restored.
2. Keep shell restoration in `src/sessions/restore-tabs.ts` asynchronous so replay is claimed before unclaimed frames are discarded.
3. Add attach and roundtrip coverage proving the original launching label and PTY return, siblings restore, and the temporary agent tab is gone.
4. Update `product/specs/remote-server.md`, `documentation/user-documentation/getting-started/startup.md`, and `documentation/user-documentation/command-bar/plugins.md` to describe remote shell restoration after relaunch and attach.

## Tests

- Extend `src/sessions/attach.test.ts` for a shell launch that resumes through the bridge and leaves the shell tab as the attached result.
- Extend `src/sessions/shell-roundtrip.test.ts` to cover the bridge's temporary label and restored shell labels across multiple processes.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

Restoring remote file navigators and changing profile behavior.
