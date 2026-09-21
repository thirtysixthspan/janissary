# Keep detached remote agents alive through terminal hangup

Issue: reattaching an agent that has been detached opens the tab, pauses then closes it, with an ended notification and a PTY EIO write error.

Complexity: 4/10

## Goal

Preserve the remote agent's persistent shell when its SSH terminal hangs up, and prevent local writes after the transport has ended.

## Approach

Exercise the real remote server through a pseudo-terminal hangup, plus the sessions, remote, shell, tab-cleanup, and controller components together through repeated agent reattachment. Mark a PTY unwritable before kill and before delivering its exit callback so cleanup cannot write to the dead transport.

## Implementation steps

1. Extend the real remote-server regression to close an actual terminal and add an integrated agent detach/reattach regression. Add PTY lifecycle guards and regression tests. Run check-diff.
2. Update the remote lifecycle spec and existing remote-agent documentation, run check-diff, promote the plan, and remove the first backlog entry.

## Tests

- Real pipe and PTY shells preserve their PID and workspace across terminal hangup and reattachment.
- Agent detachment and repeated reattachment preserve the original shell, row, and record; late old-transport exits do not close the restored tab.
- PTY writes after kill and from an exit callback never reach the terminated process; live writes still work.

## Specs / docs

Update product/specs/remote-server.md and documentation/user-documentation/advanced-agents/remote-agents.md. No help command changes.

## Out of scope

Harness display restoration, close-delivery ordering, new remote protocols, and PR description changes.

## Findings

Both the process-group signal test and actual terminal hangup preserve the remote shells on this host. There is no evidence supporting a shell-spawn change. The PTY adapter does allow writes after kill and inside exit callbacks; guard that confirmed lifecycle defect and retain integration coverage for the reported reattachment sequence.
