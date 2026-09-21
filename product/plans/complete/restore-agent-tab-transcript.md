# Restore a reattached agent tab's transcript

Issue: when an agent reattaches, its transcript should be shown in the newly opened agent tab similar to how it is done for harnesses.

Complexity: 4/10

## Goal

Render retained remote-shell output in a newly restored agent tab, without replaying it into ordinary newly launched agents or later commands.

## Approach

The remote peer already replays retained pipe output, but rebuilding an agent creates its adopted shell before a command has installed the usual command-output listener. Deliver that one restoration stream directly to the tab log while the adopted shell claims its pending frames. Strip the terminal reset prefix used for harness screen redraws because an agent transcript is text, not a terminal display.

## Implementation steps

1. Let the remote shell adapter report output received while it claims an adopted shell's pending replay frames.
2. Have `ShellManager` append that restored output as a transcript entry only for a session-matched adopted remote shell.
3. Extend the remote agent detach/attach round-trip test with retained pipe output and assert the rebuilt tab shows it.
4. Clarify the sessions spec and remote-agents documentation that retained agent output appears in the newly opened tab.

## Tests

- `src/sessions/agent-roundtrip.test.ts` — verifies a reattached agent tab contains output produced before and while detached.
- `src/remote/shell-session.test.ts` — verifies an adopted shell reports replayed output without spawning a replacement.

## Out of scope

- Reconstructing individual command prompts or command history from raw retained shell output.
- Changing retention limits, remote protocol frames, or live transport recovery.
