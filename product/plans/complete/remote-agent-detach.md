# Remote agent detach

Issue: detaching an agent on a remote host results in the followign error
murad on 10.27.1.94 cannot be detached — nothing is running in its workspace to come back to.

Complexity: 3/10

## Goal

Allow a ready remote agent to detach by ensuring it owns a remote persistent shell before it can be parked.

## Approach

- Add a narrow `ShellManager` operation that creates a tab's persistent shell without running a command.
- Invoke it once a remote agent's workspace provisioning succeeds, before the tab is presented as ready.
- Keep local and harness startup unchanged. The already-recorded remote pipe process then makes the session detachable and reattachable.

## Tests

- `src/profile/remote-agent.test.ts` verifies that a ready remote agent starts its persistent shell.

## Out of scope

- Remote harness lifecycle, session-row layout, and changes to command execution.

## Specs / docs

- `product/specs/sessions-tab.md` records that a ready remote agent remains detachable. No public documentation currently describes this internal lifecycle detail.
