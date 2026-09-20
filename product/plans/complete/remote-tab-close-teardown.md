# Deliver remote teardown before closing SSH

Issue: closing a harness tab should terminate the harness and remote connection, close the tab, and remove the remote workspace.

Complexity: 5/10

## Goal

Close a remote harness completely without leaving a detached peer or workspace behind, while keeping joined tabs alive when they still own the shared connection.

## Approach

The per-tab cleanup walk reaches the PTY manager before the remote manager. The PTY manager currently kills the SSH transport along with the tab's terminal, so the remote manager writes shutdown to a dead transport. Let the remote manager retain ownership of its transport through both tab cleanup and application disposal. Verify delivery through a real terminal as well: a shutdown written immediately before killing the terminal may still be buffered. If necessary, give the peer a bounded interval to exit after shutdown, canceling the fallback kill when it exits normally.

## Implementation steps

1. Add integrated close and shared-channel regressions. Retain remote-owned transports during general PTY cleanup, then let remote release reassign or finish them. Verify shutdown delivery and workspace removal through a real terminal. If delivery races terminal closure, add a small transport shutdown lifecycle helper. Run check-diff.
2. Update remote lifecycle specs and existing remote-agent documentation, run check-diff, promote the plan, and remove the resolved backlog entry.

## Tests

- Closing the final harness delivers shutdown before losing SSH, removes the tab and saved row, and terminates the remote process.
- Closing a launching harness preserves a joined agent's transport and shell until its final release.
- Application PTY disposal preserves remote transports long enough for remote shutdown.
- A real remote peer removes its workspace when shutdown arrives through the terminal.
- If deferred transport close is needed, it is bounded and canceled by normal process exit.

## Specs / docs

Update product/specs/remote-server.md and documentation/user-documentation/advanced-agents/remote-agents.md. No help changes.

## Out of scope

Changing shared-workspace ownership, detached-session expiry, reconnect display replay, or PR description edits.

## Findings

The integrated close regression reproduced a lost shutdown frame before the ownership change. Both real-terminal cases delivered shutdown and removed the remote workspace after the change. No deferred-close helper is needed. Four new tests cover final harness closure, joined-tab survival, and transport ownership during tab and application cleanup; the two existing real-process cases now verify shutdown delivery as well.
